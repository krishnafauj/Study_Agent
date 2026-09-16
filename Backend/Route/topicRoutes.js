import express from "express";
import Topic from "../models/topic.js";
import ProcessingProgress from "../models/processingProgress.js";
import UserFile from "../models/userFile.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { processFromS3 } from "../integration/src/pipeline.js";
import { buildConceptEdges } from "../services/knowledgeGraphService.js";

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
      console.log(`⏳ [S3-PROCESS] ${data.status} - Progress: ${data.progress}% - ${data.message || ""}`);
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
    const result = await processFromS3(
      s3Key,
      {
        bucket: process.env.S3_BUCKET,
        fileName: fileName,
        refineOutline: true,
        useLlmContentType: true,
        embed: true,
        progress: updateProgress
      }
    );

    console.log(`\n💾 [DATABASE] Inserting nodes and chunks into database...`);

    let inserted = 0;
    const nodeMap = new Map();

    const insertOutline = async (nodes, parentId = null) => {
      for (const node of nodes) {
        try {
          console.log(`  📝 [DB] Creating outline node: "${node.title}" (level: ${node.level})`);
          const newTopic = await Topic.create({
            fileId,
            userId,
            level: node.level,
            parentTopicId: parentId,
            title: node.title,
            summary: "",
            content: node.title,
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
          console.error(`  ❌ [DB] Failed to insert outline "${node.title}": ${err.message}`);
        }
      }
    };

    const insertChunks = async (chunks) => {
      for (const chunk of chunks) {
        try {
          const parentId = nodeMap.get(chunk.nodeId) || null;
          const newTopic = await Topic.create({
            fileId,
            userId,
            level: 99, 
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
          console.error(`  ❌ [DB] Failed to insert chunk: ${err.message}`);
        }
      }
    };

    // Clear any previously-extracted topics for this file to avoid duplicates on reprocess.
    const cleared = await Topic.deleteMany({ fileId });
    if (cleared.deletedCount) console.log(`🧹 [DB] Cleared ${cleared.deletedCount} stale topics before reinsert`);

    await insertOutline(result.outline);
    await insertChunks(result.chunks);
    const totalInserted = inserted;
    console.log(`\n✅ [DATABASE] Successfully inserted ${totalInserted} topics into MongoDB`);

    // Mark as completed
    console.log(`⏳ [AUTO-PROCESS] embedding - Progress: 90/100 - Finalizing database...`);
    await ProcessingProgress.updateOne(
      { fileId },
      {
        status: "completed",
        progress: 100,
        totalTopics: totalInserted,
        topicsCreated: totalInserted,
        completedAt: new Date(),
      }
    );

    console.log("\n" + "=".repeat(80));
    console.log(`✅ [COMPLETE] File processing completed successfully!`);
    console.log(`📊 Total Chunks: ${result.stats.totalChunks}`);
    console.log(`💾 Total Stored in DB: ${totalInserted}`);
    console.log("=".repeat(80) + "\n");

    // Build the prerequisite knowledge graph once, after topics/chunks exist.
    // Runs in the background so it never delays the "completed" state.
    buildConceptEdges(fileId, { useLlm: false })
      .then((s) => console.log(`🕸️  [GRAPH] ${s.edges} edges over ${s.nodes} nodes for ${fileId}`))
      .catch((e) => console.warn(`🕸️  [GRAPH] build failed: ${e.message}`));
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
