import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import UserFile from "../models/userFile.js";
import Topic from "../models/topic.js";
import { uploadFileToS3, getFileDownloadUrl, deleteFileFromS3 } from "../services/s3Service.js";
import ProcessingProgress from "../models/processingProgress.js";
import { extractFirstPageText, deriveDynamicFileName } from "../services/namingService.js";
import { getPdfPageCount } from "../integration/src/pipeline.js";
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
    
    // NOTE: We no longer parse the whole PDF at upload. Parsing happens
    // per-section (when the owner creates a section) — see accessRoutes.js +
    // sectionParseService.js. Upload just stores the file and its page count.

    if (existingFile) {
      console.log(`✨ [DEDUP] Found duplicate — reusing S3 object of ${existingFile._id}`);

      const userFile = await UserFile.create({
        userId,
        fileName: dynamicFileName,
        s3Key: existingFile.s3Key, // Reuse S3 key (same bytes)
        fileSize: req.file.size,
        fileHash,
      });

      // Sections (and therefore parsing) are per-file and defined later, so we
      // do NOT copy topics. Record page count so section ranges can be validated.
      const totalPages = await getPdfPageCount(req.file.buffer);
      await ProcessingProgress.findOneAndUpdate(
        { fileId: userFile._id },
        {
          fileId: userFile._id,
          userId,
          fileName: userFile.fileName,
          status: "completed", // no document-level processing to wait on
          progress: 100,
          totalPages,
          topicsCreated: 0,
          totalTopics: 0,
          completedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`✅ [DEDUP] File ${userFile._id} ready (${totalPages} pages). Define sections to parse.\n`);
      return res.status(201).json({
        success: true,
        file: userFile,
        deduped: true,
        message: "File ready — create sections to parse pages",
      });
    }

    // New file — upload bytes, store page count, and wait for sections.
    console.log(`🆕 [UPLOAD] New file — storing without full parse...`);
    const key = await uploadFileToS3(req.file.buffer, dynamicFileName, userId);
    const totalPages = await getPdfPageCount(req.file.buffer);
    const userFile = await UserFile.create({
      userId,
      fileName: dynamicFileName,
      s3Key: key,
      fileSize: req.file.size,
      fileHash,
    });

    await ProcessingProgress.findOneAndUpdate(
      { fileId: userFile._id },
      {
        fileId: userFile._id,
        userId,
        fileName: userFile.fileName,
        status: "completed", // parsing is deferred to per-section, nothing to run now
        progress: 100,
        totalPages,
        topicsCreated: 0,
        totalTopics: 0,
        completedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [UPLOAD] File ${userFile._id} stored (${totalPages} pages). Define sections to parse.`);
    res.status(201).json({ success: true, file: userFile, deduped: false, totalPages });
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
