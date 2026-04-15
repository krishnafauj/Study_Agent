/**
 * studyContextService.js
 *
 * Fetches study context directly from MongoDB — no MCP overhead.
 * Called by chatStreamController to build the topic-scoped system prompt.
 *
 * The primary key throughout the app is `fileId` (= UserFile._id),
 * which is also what the Topic collection indexes on.
 */

import Topic from "../models/topic.js";
import Folder from "../models/FolderSchema.js";
import UserFile from "../models/userFile.js";

// ─────────────────────────────────────────────────────────────────────────────
// Get all topics + performance marks for a file
// ─────────────────────────────────────────────────────────────────────────────
export async function getFolderContext(fileId) {
  if (!fileId) return null;

  try {
    // File metadata
    const file = await UserFile.findById(fileId).select("fileName").lean();

    // All processed topics from PDF hierarchy extraction
    const processedTopics = await Topic.find({ fileId })
      .sort({ level: 1, order: 1 })
      .select("title summary level parentTopicId content")
      .lean();

    // Performance marks from FolderSchema (if stored)
    const folder = await Folder.findOne({ fileId }).lean();
    const folderTopicsMap = {};
    (folder?.topics || []).forEach((t) => {
      if (t.topicName) folderTopicsMap[t.topicName.toLowerCase()] = t;
    });

    // Merge: enrich processed topics with any marks data
    const enrichedTopics = processedTopics.map((t) => {
      const marks = folderTopicsMap[t.title?.toLowerCase()];
      return {
        title: t.title,
        summary: t.summary,
        level: t.level,
        performanceScore: marks?.performanceScore ?? null,
        weakFlag: marks?.weakFlag ?? false,
        marks: marks?.marks ?? [],
      };
    });

    return {
      fileId,
      fileName: file?.fileName || "Unknown File",
      topics: enrichedTopics,
      totalTopics: enrichedTopics.length,
      hasPerformanceData: (folder?.topics || []).length > 0,
    };
  } catch (err) {
    console.error("[studyContextService] getFolderContext error:", err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get topics with weak performance (< threshold) or never attempted
// ─────────────────────────────────────────────────────────────────────────────
export async function getWeakTopics(fileId, threshold = 70) {
  if (!fileId) return { weakTopics: [], count: 0 };

  try {
    const folder = await Folder.findOne({ fileId }).lean();
    const folderTopics = folder?.topics || [];

    if (folderTopics.length > 0) {
      // Real marks exist — filter by score
      const weak = folderTopics
        .filter((t) => {
          const score = t.performanceScore;
          return score === null || score === undefined || score < threshold;
        })
        .sort((a, b) => {
          if (a.performanceScore === null || a.performanceScore === undefined) return 1;
          if (b.performanceScore === null || b.performanceScore === undefined) return -1;
          return a.performanceScore - b.performanceScore;
        })
        .map((t) => ({
          topicName: t.topicName,
          performanceScore: t.performanceScore,
          weakFlag: t.weakFlag,
        }));

      return { weakTopics: weak, count: weak.length, source: "marks_data" };
    }

    // No marks yet — all main topics are "not attempted"
    const allMainTopics = await Topic.find({ fileId, level: 0 })
      .select("title")
      .lean();

    return {
      weakTopics: allMainTopics.map((t) => ({
        topicName: t.title,
        performanceScore: null,
        weakFlag: true,
      })),
      count: allMainTopics.length,
      source: "not_attempted",
    };
  } catch (err) {
    console.error("[studyContextService] getWeakTopics error:", err.message);
    return { weakTopics: [], count: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG: find the most relevant topic chunks for a query
// Uses text search (upgrade to vector search when embeddings are available)
// ─────────────────────────────────────────────────────────────────────────────
export async function getRagContext(query, fileId, limit = 4) {
  if (!query || !fileId) return [];

  try {
    const chunks = await Topic.find({
      fileId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { content: { $regex: query, $options: "i" } },
        { summary: { $regex: query, $options: "i" } },
      ],
    })
      .limit(limit)
      .select("title summary content level pageStart pageEnd")
      .sort({ level: 1 })
      .lean();

    return chunks.map((c) => ({
      title: c.title,
      summary: c.summary,
      content: c.content?.slice(0, 600),
      level: c.level,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
    }));
  } catch (err) {
    console.error("[studyContextService] getRagContext error:", err.message);
    return [];
  }
}
