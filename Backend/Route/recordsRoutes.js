import express from "express";
import Folder from "../models/FolderSchema.js";
import UserFile from "../models/userFile.js";
import Topic from "../models/topic.js";

const router = express.Router();

// GET /api/records — All files with performance summary for this user
router.get("/records", async (req, res) => {
  try {
    const userId = req.user.userId;
    const userEmail = req.user.email;

    // Get all files the user owns or is assigned to
    const files = await UserFile.find({
      $or: [{ userId }, { assignedTo: userEmail }]
    }).lean();

    if (!files.length) {
      return res.json({ success: true, records: [] });
    }

    const fileIds = files.map(f => f._id.toString());

    // Get all folders (performance data) for these files
    const folders = await Folder.find({ fileId: { $in: fileIds } }).lean();
    const folderMap = {};
    folders.forEach(f => { folderMap[f.fileId] = f; });

    // Get topic counts per file
    const topicCounts = await Topic.aggregate([
      { $match: { fileId: { $in: fileIds }, level: 0 } },
      { $group: { _id: "$fileId", count: { $sum: 1 } } }
    ]);
    const topicCountMap = {};
    topicCounts.forEach(t => { topicCountMap[t._id] = t.count; });

    const records = files.map(file => {
      const folder = folderMap[file._id.toString()];
      const scoredTopics = folder?.topics || [];
      const totalTopics = topicCountMap[file._id.toString()] || 0;

      const attempted = scoredTopics.filter(t => t.performanceScore !== null && t.performanceScore !== undefined);
      const overallScore = attempted.length > 0
        ? Math.round(attempted.reduce((s, t) => s + t.performanceScore, 0) / attempted.length * 10) / 10
        : null;

      return {
        fileId: file._id.toString(),
        fileName: file.fileName,
        uploadedAt: file.uploadedAt,
        totalTopics,
        attemptedTopics: attempted.length,
        overallScore,
        topics: scoredTopics.map(t => ({
          topicName: t.topicName,
          performanceScore: t.performanceScore,
          weakFlag: t.weakFlag,
          attempts: t.marks?.length || 0,
          lastAttempt: t.marks?.length ? t.marks[t.marks.length - 1].attemptedAt : null,
          marks: t.marks || []
        }))
      };
    });

    res.json({ success: true, records });
  } catch (err) {
    console.error("[Records] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/records/:fileId — Detailed performance for a specific file
router.get("/records/:fileId", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId } = req.params;

    const file = await UserFile.findById(fileId).lean();
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    const folder = await Folder.findOne({ fileId }).lean();
    const allTopics = await Topic.find({ fileId, level: 0 })
      .select("title summary")
      .lean();

    const scoredMap = {};
    (folder?.topics || []).forEach(t => {
      scoredMap[t.topicName?.toLowerCase()] = t;
    });

    // Merge: every topic gets shown, even if not scored yet
    const topics = allTopics.map(t => {
      const scored = scoredMap[t.title?.toLowerCase()];
      return {
        topicName: t.title,
        summary: t.summary,
        performanceScore: scored?.performanceScore ?? null,
        weakFlag: scored?.weakFlag ?? false,
        attempts: scored?.marks?.length || 0,
        lastAttempt: scored?.marks?.length ? scored.marks[scored.marks.length - 1].attemptedAt : null,
        marks: scored?.marks || []
      };
    });

    const attempted = topics.filter(t => t.performanceScore !== null);
    const overallScore = attempted.length > 0
      ? Math.round(attempted.reduce((s, t) => s + t.performanceScore, 0) / attempted.length * 10) / 10
      : null;

    res.json({
      success: true,
      fileId,
      fileName: file.fileName,
      overallScore,
      totalTopics: topics.length,
      attemptedTopics: attempted.length,
      topics
    });
  } catch (err) {
    console.error("[Records/:fileId] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
