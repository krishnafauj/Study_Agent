/**
 * Internal routes — only callable by the MCP server (not public).
 * Protected by the MCP_SECRET header.
 *
 * The main "context" unit in this app is a FILE (UserFile._id = fileId).
 * Topics are extracted from files and stored in the Topic collection.
 * FolderSchema is a secondary structure that can carry marks per topic.
 *
 * Routes:
 *   GET /api/internal/folder-context/:fileId    → topics + marks for a file
 *   GET /api/internal/weak-topics/:fileId       → topics with performanceScore < threshold
 *   GET /api/internal/rag-context               → vector-similarity topic chunks
 */

import express from "express";
import Folder from "../models/FolderSchema.js";
import Topic from "../models/topic.js";
import UserFile from "../models/userFile.js";

const router = express.Router();

// ─── Guard: only MCP server may call these ───────────────────────────────────
function requireMcpSecret(req, res, next) {
  const secret = req.headers["x-mcp-secret"];
  const expected = process.env.MCP_SECRET || "mcp-internal-secret";
  if (secret !== expected) {
    return res.status(403).json({ error: "Forbidden: invalid MCP secret" });
  }
  next();
}

router.use(requireMcpSecret);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/internal/folder-context/:fileId
// Returns all topics + their performance marks for the given file.
// The "fileId" here is UserFile._id — same as what Topic.fileId references.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/folder-context/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file metadata
    const file = await UserFile.findById(fileId).lean();

    // Get all processed topics (from PDF hierarchy extraction)
    const processedTopics = await Topic.find({ fileId })
      .sort({ level: 1, order: 1 })
      .select("title summary level parentTopicId content")
      .lean();

    // Get performance marks (from FolderSchema, if exists)
    const folder = await Folder.findOne({ fileId }).lean();
    const folderTopics = folder?.topics || [];

    // Build a combined topic list: merge processedTopics with folderTopics marks
    const folderTopicsMap = {};
    folderTopics.forEach((t) => {
      if (t.topicName) folderTopicsMap[t.topicName.toLowerCase()] = t;
    });

    const enrichedTopics = processedTopics.map((t) => {
      const marksData = folderTopicsMap[t.title?.toLowerCase()];
      return {
        title: t.title,
        summary: t.summary,
        level: t.level,
        performanceScore: marksData?.performanceScore ?? null,
        weakFlag: marksData?.weakFlag ?? false,
        marks: marksData?.marks ?? [],
      };
    });

    res.json({
      fileId,
      fileName: file?.fileName || "Unknown File",
      topics: enrichedTopics,
      totalTopics: enrichedTopics.length,
      hasPerformanceData: folderTopics.length > 0,
    });
  } catch (err) {
    console.error("folder-context error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/internal/weak-topics/:fileId?threshold=70
// Returns topics where performanceScore < threshold (or not attempted yet)
// Pulls from both FolderSchema (if exists) and raw Topic list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/weak-topics/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const threshold = parseFloat(req.query.threshold) || 70;

    const folder = await Folder.findOne({ fileId }).lean();
    const folderTopics = folder?.topics || [];

    // If we have marks data, use it to find weak topics
    if (folderTopics.length > 0) {
      const weakTopics = folderTopics.filter((t) => {
        if (t.performanceScore === null || t.performanceScore === undefined) {
          return true; // never attempted — treat as needing attention
        }
        return t.performanceScore < threshold;
      });

      weakTopics.sort((a, b) => {
        if (a.performanceScore === null) return 1;
        if (b.performanceScore === null) return -1;
        return a.performanceScore - b.performanceScore;
      });

      return res.json({
        fileId,
        threshold,
        weakTopics: weakTopics.map((t) => ({
          topicName: t.topicName,
          performanceScore: t.performanceScore,
          weakFlag: t.weakFlag,
          marks: t.marks,
        })),
        count: weakTopics.length,
        source: "marks_data",
      });
    }

    // No marks yet — return all top-level topics as "not attempted"
    const allTopics = await Topic.find({ fileId, level: 0 })
      .select("title summary")
      .lean();

    return res.json({
      fileId,
      threshold,
      weakTopics: allTopics.map((t) => ({
        topicName: t.title,
        performanceScore: null,
        weakFlag: true,
        marks: [],
      })),
      count: allTopics.length,
      source: "not_attempted",
    });
  } catch (err) {
    console.error("weak-topics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/internal/rag-context?query=...&fileId=...&folderId=...&limit=5
// Fetches the most relevant topic chunks from the Topic collection.
// Uses text matching (upgrade to vector search when ready).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/rag-context", async (req, res) => {
  try {
    const { query, fileId, folderId, limit = 5 } = req.query;

    if (!query || query.length < 2) {
      return res.json({ chunks: [], count: 0 });
    }

    const searchQuery = {};

    // Scope to file (folderId = fileId in current architecture)
    if (fileId) {
      searchQuery.fileId = fileId;
    } else if (folderId) {
      // folderId can be treated as fileId in the current single-file-per-folder model
      searchQuery.fileId = folderId;
    }

    // Text search across title + content + summary
    searchQuery.$or = [
      { title: { $regex: query, $options: "i" } },
      { content: { $regex: query, $options: "i" } },
      { summary: { $regex: query, $options: "i" } },
    ];

    const chunks = await Topic.find(searchQuery)
      .limit(parseInt(limit))
      .select("title summary content level pageStart pageEnd fileId")
      .sort({ level: 1 })
      .lean();

    // Trim content to avoid massive payloads
    const trimmedChunks = chunks.map((c) => ({
      title: c.title,
      summary: c.summary,
      content: c.content?.slice(0, 600),
      level: c.level,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
    }));

    res.json({
      query,
      chunks: trimmedChunks,
      count: trimmedChunks.length,
    });
  } catch (err) {
    console.error("rag-context error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
