import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import UserFile from "../models/userFile.js";
import Topic from "../models/topic.js";
import { uploadFileToS3, getFileDownloadUrl, deleteFileFromS3 } from "../services/s3Service.js";
import ProcessingProgress from "../models/processingProgress.js";
import { processPDFHierarchy } from "../services/pdfHierarchyService.js";

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

// List files for authenticated user
router.get("/files", async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await UserFile.find({ userId }).sort({ uploadedAt: -1 });
    res.json({ success: true, files });
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

    // Step 2: Check if this file already exists in DB
    console.log(`🔍 [DEDUP] Checking database for duplicate...`);
    const existingFile = await UserFile.findOne({ fileHash });
    
    if (existingFile) {
      console.log(`✨ [DEDUP] Found duplicate! File ID: ${existingFile._id}`);
      console.log(`📚 [DEDUP] Reusing ${await Topic.countDocuments({ fileId: existingFile._id })} existing topics`);
      
      // Create a new UserFile entry that references the same topics
      const userFile = await UserFile.create({
        userId,
        fileName: req.file.originalname,
        s3Key: existingFile.s3Key, // Reuse S3 key
        fileSize: req.file.size,
        fileHash, // Store the hash
      });

      console.log(`✅ [DEDUP] Created new file entry (ID: ${userFile._id}) reusing topics from ${existingFile._id}`);

      // Copy topics from existing file to this new file entry
      console.log(`📋 [DEDUP] Copying topics to new file entry...`);
      const existingTopics = await Topic.find({ fileId: existingFile._id });
      const copiedTopics = await Promise.all(
        existingTopics.map(topic => 
          Topic.create({
            fileId: userFile._id,
            userId,
            level: topic.level,
            parentTopicId: topic.parentTopicId, // Maintain hierarchy
            title: topic.title,
            summary: topic.summary,
            content: topic.content,
            embedding: topic.embedding,
            order: topic.order,
          })
        )
      );
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
    const key = await uploadFileToS3(req.file.buffer, req.file.originalname, userId);
    const userFile = await UserFile.create({
      userId,
      fileName: req.file.originalname,
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
          console.log(`⏳ [AUTO-PROCESS] ${data.status} - Progress: ${data.progress}/10 - ${data.message || ""}`);
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
        console.log(`⏳ [UPLOAD] Calling processPDFHierarchy...`);
        const result = await processPDFHierarchy(
          key, 
          userFile.fileName, 
          userFile._id.toString(), 
          userId, 
          progressCallback
        );

        console.log(`✅ [UPLOAD] processPDFHierarchy returned ${result.totalTopics} topics`);

        // 🚨 FIX: Actually save the results to MongoDB!
        console.log(`\n💾 [UPLOAD-DB] Starting database insertion...`);
        const insertTopics = async (topics, parentId = null, level = 0) => {
          let inserted = 0;
          for (const topic of topics) {
            try {
              console.log(`  📝 [UPLOAD-DB] Creating: "${topic.title}" (level: ${level})`);
              
              const newTopic = await Topic.create({
                fileId: userFile._id,
                userId,
                level: topic.level,
                parentTopicId: parentId,
                title: topic.title,
                summary: topic.summary,
                content: topic.content,
                embedding: topic.embedding || [],
                order: topic.order,
              });

              console.log(`  ✅ [UPLOAD-DB] Stored: "${newTopic.title}" (ID: ${newTopic._id})`);
              inserted++;

              // Process children recursively
              if (topic.children && topic.children.length > 0) {
                const childCount = await insertTopics(topic.children, newTopic._id, level + 1);
                inserted += childCount;
              }
            } catch (topicErr) {
              console.error(`  ❌ [UPLOAD-DB] Failed to insert "${topic.title}": ${topicErr.message}`);
            }
          }
          return inserted;
        };

        // Execute the save
        const totalSaved = await insertTopics(result.topics);
        console.log(`✅ [UPLOAD-DB] Saved ${totalSaved} topics to MongoDB\n`);

        // Mark progress as fully completed
        await ProcessingProgress.updateOne(
          { fileId: userFile._id },
          {
            status: "completed",
            progress: 10,
            totalTopics: result.totalTopics,
            topicsCreated: result.totalTopics,
            completedAt: new Date(),
          }
        );

        console.log(`\n${"=".repeat(80)}`);
        console.log(`✅ [UPLOAD] PDF Processing Complete!`);
        console.log(`📊 Total Topics: ${result.totalTopics}`);
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

export default router;
