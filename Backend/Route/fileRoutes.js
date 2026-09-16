import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import UserFile from "../models/userFile.js";
import Topic from "../models/topic.js";
import { uploadFileToS3, getFileDownloadUrl, deleteFileFromS3 } from "../services/s3Service.js";
import ProcessingProgress from "../models/processingProgress.js";
import { extractFirstPageText, deriveDynamicFileName } from "../services/namingService.js";
import { processBuffer } from "../integration/src/pipeline.js";
import User from "../models/user.js";
import { sendAssignmentEmail } from "../services/emailService.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

// List files for authenticated user (owned or assigned)
router.get("/files", async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const files = await UserFile.find({ 
      $or: [
        { userId },
        { assignedTo: email }
      ]
    }).sort({ uploadedAt: -1 }).lean();

    const processedFiles = files.map(f => ({
      ...f,
      isOwner: f.userId === userId
    }));

    res.json({ success: true, files: processedFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single file details
router.get("/files/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const file = await UserFile.findOne({ 
      _id: req.params.id,
      $or: [
        { userId },
        { assignedTo: email }
      ]
    }).lean();

    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const processedFile = {
      ...file,
      isOwner: file.userId === userId
    };

    res.json({ success: true, file: processedFile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload PDF
router.post("/files/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!req.file) return res.status(400).json({ success: false, message: "File is required" });

    // Step 1: Calculate SHA256 hash for deduplication
    console.log(`\n📋 [DEDUP] Calculating SHA256 hash for: ${req.file.originalname}`);
    const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    console.log(`✅ [DEDUP] Hash: ${fileHash}`);

    // Dynamic naming
    console.log(`\n📋 [NAMING] Extracting text to derive dynamic name...`);
    const firstPageText = await extractFirstPageText(req.file.buffer);
    const dynamicFileName = deriveDynamicFileName(firstPageText, req.file.originalname);
    console.log(`✅ [NAMING] Derived name: ${dynamicFileName}`);

    // Step 2: Check if this file already exists in DB
    console.log(`🔍 [DEDUP] Checking database for duplicate...`);
    const existingFile = await UserFile.findOne({ fileHash });
    
    if (existingFile) {
      console.log(`✨ [DEDUP] Found duplicate! File ID: ${existingFile._id}`);
      console.log(`📚 [DEDUP] Reusing ${await Topic.countDocuments({ fileId: existingFile._id })} existing topics`);
      
      // Create a new UserFile entry that references the same topics
      const userFile = await UserFile.create({
        userId,
        fileName: dynamicFileName, // Use dynamic name instead of existing or original
        s3Key: existingFile.s3Key, // Reuse S3 key
        fileSize: req.file.size,
        fileHash, // Store the hash
      });

      console.log(`✅ [DEDUP] Created new file entry (ID: ${userFile._id}) reusing topics from ${existingFile._id}`);

      // Copy topics from existing file to this new file entry
      console.log(`📋 [DEDUP] Copying topics to new file entry...`);
      const existingTopics = await Topic.find({ fileId: existingFile._id }).lean();
      // Pass 1: create copies and map old _id -> new _id
      const idMap = new Map();
      const created = [];
      for (const t of existingTopics) {
        const nt = await Topic.create({
          fileId: userFile._id,
          userId,
          level: t.level,
          parentTopicId: null, // fixed in pass 2
          title: t.title,
          summary: t.summary,
          content: t.content,
          embedding: t.embedding,
          order: t.order,
          number: t.number || "",
          contentType: t.contentType || "",
          isChunk: t.isChunk || false,
          pageStart: t.pageStart || 0,
          pageEnd: t.pageEnd || 0,
        });
        idMap.set(String(t._id), nt._id);
        created.push({ nt, oldParent: t.parentTopicId });
      }
      // Pass 2: remap parent links to the NEW copies (was pointing at the original file's ids)
      for (const { nt, oldParent } of created) {
        if (oldParent && idMap.has(String(oldParent))) {
          nt.parentTopicId = idMap.get(String(oldParent));
          await nt.save();
        }
      }
      const copiedTopics = created;
      console.log(`✅ [DEDUP] Copied ${copiedTopics.length} topics`);

      // Mark as completed immediately since we reused
      await ProcessingProgress.findOneAndUpdate(
        { fileId: userFile._id },
        {
          fileId: userFile._id,
          userId,
          fileName: userFile.fileName,
          status: "completed",
          progress: 10,
          topicsCreated: copiedTopics.length,
          totalTopics: copiedTopics.length,
          completedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`🎉 [DEDUP] Processing complete (reused)!\n`);
      return res.status(201).json({ 
        success: true, 
        file: userFile,
        deduped: true,
        message: "File deduplicated and topics reused"
      });
    }

    // Step 3: New file - proceed with full processing
    console.log(`🆕 [DEDUP] This is a new file, proceeding with full processing...`);
    const key = await uploadFileToS3(req.file.buffer, dynamicFileName, userId);
    const userFile = await UserFile.create({
      userId,
      fileName: dynamicFileName,
      s3Key: key,
      fileSize: req.file.size,
      fileHash, // Store the hash for future deduplication
    });

    console.log(`✅ [UPLOAD] File created (ID: ${userFile._id})`);

    // Auto-start PDF processing for embeddings
    (async () => {
      try {
        console.log(`\n🚀 [UPLOAD] Auto-processing started for: ${userFile.fileName}`);
        
        await ProcessingProgress.findOneAndUpdate(
          { fileId: userFile._id },
          {
            fileId: userFile._id,
            userId,
            fileName: userFile.fileName,
            status: "pending",
            progress: 0,
            topicsCreated: 0,
            error: null,
          },
          { upsert: true, new: true }
        );
        
        // Progress callback for auto-processing
        const progressCallback = async (data) => {
          console.log(`⏳ [AUTO-PROCESS] ${data.status} - Progress: ${data.progress}% - ${data.message || ""}`);
          await ProcessingProgress.updateOne(
            { fileId: userFile._id },
            {
              status: data.status,
              progress: data.progress,
              topicsCreated: data.topicsCreated || 0,
            }
          );
        };
        
        // 🚨 FIX: Await the hierarchy processor to get the results back!
        console.log(`⏳ [UPLOAD] Calling processBuffer...`);
        const result = await processBuffer(req.file.buffer, {
          fileName: userFile.fileName,
          refineOutline: true,
          useLlmContentType: true,
          embed: true,
          progress: progressCallback
        });

        console.log(`✅ [UPLOAD] processBuffer returned ${result.stats.totalChunks} chunks`);

        // 🚨 FIX: Actually save the results to MongoDB!
        console.log(`\n💾 [UPLOAD-DB] Starting database insertion...`);
        let inserted = 0;
        const nodeMap = new Map();

        const insertOutline = async (nodes, parentId = null) => {
          for (const node of nodes) {
            try {
              console.log(`  📝 [UPLOAD-DB] Creating outline node: "${node.title}" (level: ${node.level})`);
              const newTopic = await Topic.create({
                fileId: userFile._id,
                userId,
                level: node.level,
                parentTopicId: parentId,
                title: node.title,
                summary: node.summary || "",
                content: node.title, // Outline nodes don't have large text
                keyConcepts: node.keyConcepts || [],
                formulas: node.formulas || [],
                mcqs: node.mcqs || [],
                embedding: [],
                order: inserted,
                number: node.number || "",
                isChunk: false,
                pageStart: node.pageStart || 0,
                pageEnd: node.pageEnd || 0,
              });
              nodeMap.set(node.id, newTopic._id);
              inserted++;

              if (node.children && node.children.length > 0) {
                await insertOutline(node.children, newTopic._id);
              }
            } catch (err) {
              console.error(`  ❌ [UPLOAD-DB] Failed to insert outline "${node.title}": ${err.message}`);
            }
          }
        };

        const insertChunks = async (chunks) => {
          for (const chunk of chunks) {
            try {
              const parentId = nodeMap.get(chunk.nodeId) || null;
              // Make chunks a child of their corresponding outline node
              const newTopic = await Topic.create({
                fileId: userFile._id,
                userId,
                level: 99, // Distinguishes leaf chunks from structural nodes
                parentTopicId: parentId,
                title: chunk.title || "Content Chunk",
                summary: chunk.kind || "text",
                content: chunk.text,
                embedding: chunk.embedding || [],
                order: inserted,
                isChunk: true,
                contentType: chunk.contentType || "",
                pageStart: chunk.pageStart || 0,
                pageEnd: chunk.pageEnd || 0,
              });
              inserted++;
            } catch (err) {
              console.error(`  ❌ [UPLOAD-DB] Failed to insert chunk: ${err.message}`);
            }
          }
        };

        // Execute the save
        await insertOutline(result.outline);
        await insertChunks(result.chunks);
        const totalSaved = inserted;
        console.log(`✅ [UPLOAD-DB] Saved ${totalSaved} topics to MongoDB\n`);

        // Mark progress as fully completed
        await ProcessingProgress.updateOne(
          { fileId: userFile._id },
          {
            status: "completed",
            progress: 100,
            totalTopics: totalSaved,
            topicsCreated: totalSaved,
            completedAt: new Date(),
          }
        );

        console.log(`\n${"=".repeat(80)}`);
        console.log(`✅ [UPLOAD] PDF Processing Complete!`);
        console.log(`📊 Total Chunks: ${result.stats.totalChunks}`);
        console.log(`💾 Total Saved: ${totalSaved}`);
        console.log(`${"=".repeat(80)}\n`);

      } catch (err) {
        console.error(`\n❌ [UPLOAD] Auto-processing error:`, err.message);
        await ProcessingProgress.updateOne(
          { fileId: userFile._id },
          {
            status: "failed",
            error: err.message,
          }
        );
      }
    })();

    res.status(201).json({ success: true, file: userFile, deduped: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get temporary download URL
router.get("/files/:id/download", async (req, res) => {
  try {
    const userId = req.user.userId;
    const file = await UserFile.findById(req.params.id);
    if (!file || file.userId !== userId) return res.status(404).json({ success: false, message: "Not found" });

    const url = await getFileDownloadUrl(file.s3Key);
    res.json({ success: true, url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename file metadata
router.patch("/files/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileName } = req.body;

    if (!fileName || !fileName.trim()) {
      return res.status(400).json({ success: false, message: "fileName is required" });
    }

    const file = await UserFile.findById(req.params.id);
    if (!file || file.userId !== userId) return res.status(404).json({ success: false, message: "Not found" });

    file.fileName = fileName.trim();
    await file.save();
    res.json({ success: true, file });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete file
router.delete("/files/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const file = await UserFile.findById(req.params.id);
    if (!file || file.userId !== userId) return res.status(404).json({ success: false, message: "Not found" });

    console.log(`🗑️  [FILE DELETE] Deleting file: ${file.fileName} (ID: ${file._id})`);
    
    // Also delete associated topics (works for both original and deduplicated entries)
    const topicsDeleted = await Topic.deleteMany({ fileId: file._id });
    console.log(`🗑️  [FILE DELETE] Deleted ${topicsDeleted.deletedCount} associated topics`);
    
    // Only delete from S3 if this is the original file
    // (deduplicated files share the same S3 key with the original)
    const otherFilesWithSameKey = await UserFile.countDocuments({
      s3Key: file.s3Key,
      _id: { $ne: file._id }
    });
    
    if (otherFilesWithSameKey === 0) {
      await deleteFileFromS3(file.s3Key);
      console.log(`🗑️  [FILE DELETE] Deleted from S3`);
    } else {
      console.log(`⚠️  [FILE DELETE] S3 file retained (used by ${otherFilesWithSameKey} other entries)`);
    }
    
    // Delete file record
    await file.deleteOne();
    console.log(`✅ [FILE DELETE] File completely removed from system`);

    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── ASSIGNMENT ROUTES ──────────────────────────────────────────────────

// Assign PDF to emails
router.post("/files/:id/assign", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const file = await UserFile.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!file) return res.status(404).json({ success: false, message: "File not found or unauthorized" });

    // Extract emails using regex (split by space or comma)
    const emails = email.split(/[\s,]+/).map(e => e.trim()).filter(e => e);

    if (!file.assignedTo) file.assignedTo = [];
    
    // Fetch owner details once
    const owner = await User.findById(req.user.userId);
    const ownerName = owner ? owner.name : "A user";

    for (const e of emails) {
      if (!file.assignedTo.includes(e)) {
        file.assignedTo.push(e);
        // Send email
        await sendAssignmentEmail(e, ownerName, file.fileName, file._id).catch(err => {
          console.error(`Failed to send email to ${e}:`, err.message);
        });
      }
    }
    
    await file.save();

    res.json({ success: true, assignedTo: file.assignedTo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Revoke PDF access
router.post("/files/:id/revoke", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const file = await UserFile.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!file) return res.status(404).json({ success: false, message: "File not found or unauthorized" });

    if (file.assignedTo && file.assignedTo.includes(email)) {
      file.assignedTo = file.assignedTo.filter(e => e !== email);
      await file.save();
    }

    res.json({ success: true, assignedTo: file.assignedTo || [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
