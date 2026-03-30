import { Router } from "express";
import multer from "multer";
import UserFile from "../models/userFile.js";
import { uploadFileToS3, getFileDownloadUrl, deleteFileFromS3 } from "../services/s3Service.js";

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

    const key = await uploadFileToS3(req.file.buffer, req.file.originalname, userId);
    const userFile = await UserFile.create({
      userId,
      fileName: req.file.originalname,
      s3Key: key,
      fileSize: req.file.size,
    });

    res.status(201).json({ success: true, file: userFile });
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

    await deleteFileFromS3(file.s3Key);
    await file.deleteOne();

    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
