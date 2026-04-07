import express from "express";
import Topic from "../models/topic.js";
import ProcessingProgress from "../models/processingProgress.js";
import UserFile from "../models/userFile.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { processPDFHierarchy } from "../services/pdfHierarchyService.js";

const router = express.Router();

/**
 * POST /api/topics/process/:fileId
 * Trigger PDF processing to extract hierarchical topics
 */
router.post("/topics/process/:fileId", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    // Get file info
    const file = await UserFile.findOne({ _id: fileId, userId });
    if (!file) {
      return res.status(404).json({ success: false, error: "File not found" });
    }

    // Check if already processing
    let progress = await ProcessingProgress.findOne({ fileId });
    if (progress && progress.status !== "completed" && progress.status !== "failed") {
      return res.status(400).json({
        success: false,
        error: "File is already being processed",
      });
    }

    // Create or reset progress
    progress = await ProcessingProgress.findOneAndUpdate(
      { fileId },
      {
        fileId,
        userId,
        fileName: file.fileName,
        status: "pending",
        progress: 0,
        topicsCreated: 0,
        error: null,
      },
      { upsert: true, new: true }
    );

    // Start processing in background
    processFileAsync(fileId, userId, file.s3Key, file.fileName);

    res.json({
      success: true,
      message: "Processing started",
      progress,
    });
  } catch (err) {
    console.error("Process topics error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/topics/progress/:fileId
 * Get processing progress
 */
router.get("/topics/progress/:fileId", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const progress = await ProcessingProgress.findOne({ fileId, userId });
    if (!progress) {
      return res.json({
        success: true,
        progress: null,
        status: "not-started",
      });
    }

    res.json({ success: true, progress });
  } catch (err) {
    console.error("Get progress error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/topics/:fileId
 * Get all topics for a file (hierarchical)
 */
router.get("/topics/:fileId", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const { search } = req.query;

    // Build query
    const query = { fileId, userId };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    // Get topics
    const topics = await Topic.find(query)
      .sort({ level: 1, order: 1 })
      .lean();

    // Build hierarchical structure
    const mainTopics = topics.filter((t) => !t.parentTopicId);
    const topicsMap = new Map(topics.map((t) => [t._id.toString(), t]));

    const buildTree = (parentId) => {
      return topics
        .filter((t) => {
          const pId = t.parentTopicId ? t.parentTopicId.toString() : null;
          return pId === (parentId ? parentId.toString() : null);
        })
        .map((t) => ({
          ...t,
          children: buildTree(t._id),
        }));
    };

    const hierarchicalTopics = mainTopics.map((t) => ({
      ...t,
      children: buildTree(t._id),
    }));

    res.json({
      success: true,
      topics: hierarchicalTopics,
      total: topics.length,
    });
  } catch (err) {
    console.error("Get topics error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/topics/topic/:topicId
 * Get single topic with full details
 */
router.get("/topics/topic/:topicId", verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const userId = req.user.userId;

    const topic = await Topic.findOne({ _id: topicId, userId });
    if (!topic) {
      return res.status(404).json({ success: false, error: "Topic not found" });
    }

    // Get children
    const children = await Topic.find({ parentTopicId: topicId, userId })
      .sort({ order: 1 })
      .lean();

    res.json({
      success: true,
      topic: { ...topic, children },
    });
  } catch (err) {
    console.error("Get topic error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/topics/search
 * Search topics across all files
 */
router.post("/topics/search", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { query, fileId } = req.body;

    if (!query || query.length < 2) {
      return res.json({ success: true, results: [] });
    }

    const searchQuery = { userId, title: { $regex: query, $options: "i" } };
    if (fileId) searchQuery.fileId = fileId;

    const results = await Topic.find(searchQuery).limit(20).lean();

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (err) {
    console.error("Search topics error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Background processing function
 */
async function processFileAsync(fileId, userId, s3Key, fileName) {
  try {
    console.log(`\n🔄 [BACKGROUND] Starting async processing for file: ${fileName}`);
    
    const updateProgress = async (data) => {
      console.log(`⏳ [PROGRESS] ${data.status} - Progress: ${data.progress}/10 - ${data.message || ""}`);
      await ProcessingProgress.updateOne(
        { fileId },
        {
          status: data.status,
          progress: data.progress,
          topicsCreated: data.topicsCreated || 0,
        }
      );
    };

    // Start processing
    const result = await processPDFHierarchy(
      s3Key,
      fileName,
      fileId,
      userId,
      updateProgress
    );

    console.log(`\n💾 [DATABASE] Inserting ${result.totalTopics} topics into database...`);

    // Insert topics into database recursively
    const insertTopics = async (topics, parentId = null, level = 0) => {
      let inserted = 0;
      for (const topic of topics) {
        try {
          console.log(`  📝 [DB] Creating topic: "${topic.title}" (level: ${level}, hasEmbedding: ${topic.embedding && topic.embedding.length > 0})`);
          
          const newTopic = await Topic.create({
            fileId,
            userId,
            level: topic.level,
            parentTopicId: parentId,
            title: topic.title,
            summary: topic.summary,
            content: topic.content,
            embedding: topic.embedding || [],
            order: topic.order,
          });

          console.log(`  ✅ [DB] Successfully stored: "${newTopic.title}" (ID: ${newTopic._id}, embedding size: ${newTopic.embedding.length})`);
          inserted++;

          // Insert children
          if (topic.children && topic.children.length > 0) {
            console.log(`  🔄 [DB] Processing ${topic.children.length} children of "${topic.title}"...`);
            const childCount = await insertTopics(topic.children, newTopic._id, level + 1);
            inserted += childCount;
          }
        } catch (dbErr) {
          console.error(`  ❌ [DB] Failed to insert "${topic.title}": ${dbErr.message}`);
        }
      }
      return inserted;
    };

    const totalInserted = await insertTopics(result.topics);
    console.log(`\n✅ [DATABASE] Successfully inserted ${totalInserted} topics into MongoDB`);

    // Mark as completed
    console.log(`⏳ [AUTO-PROCESS] embedding - Progress: 9/10 - Finalizing database...`);
    await ProcessingProgress.updateOne(
      { fileId },
      {
        status: "completed",
        progress: 10,
        totalTopics: result.totalTopics,
        topicsCreated: result.totalTopics,
        completedAt: new Date(),
      }
    );

    console.log("\n" + "=".repeat(80));
    console.log(`✅ [COMPLETE] File processing completed successfully!`);
    console.log(`📊 Total Topics: ${result.totalTopics}`);
    console.log(`💾 Total Stored in DB: ${totalInserted}`);
    console.log("=".repeat(80) + "\n");
  } catch (err) {
    console.error("\n" + "=".repeat(80));
    console.error(`❌ [ERROR] File processing failed!`);
    console.error(`Error: ${err.message}`);
    console.error("=".repeat(80) + "\n");
    await ProcessingProgress.updateOne(
      { fileId },
      {
        status: "failed",
        error: err.message,
      }
    );
  }
}

export default router;
