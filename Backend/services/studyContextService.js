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
import { embedQuery, cosineSimilarity } from "./embeddingService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Get all topics + performance marks for a file
// ─────────────────────────────────────────────────────────────────────────────
export async function getFolderContext(fileId) {
  if (!fileId) return null;

  try {
    // File metadata
    const file = await UserFile.findById(fileId).select("fileName").lean();

    // All processed topics from PDF hierarchy extraction
    const processedTopics = await Topic.find({ fileId, isChunk: { $ne: true } })
      .sort({ level: 1, order: 1 })
      .select("title summary level parentTopicId content number")
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
        number: t.number || "",
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

  const shape = (c, score) => ({
    title: c.title,
    number: c.number || "",
    contentType: c.contentType || "",
    content: (c.content || "").slice(0, 800),
    level: c.level,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    score: score != null ? Number(score.toFixed(3)) : undefined,
  });

  try {
    // ── 1) Semantic: embed the query, cosine-rank stored chunk embeddings ──
    //    (For large corpora, replace this in-memory scan with a MongoDB Atlas
    //     $vectorSearch aggregation on the `embedding` field.)
    const qVec = await embedQuery(query).catch((e) => {
      console.warn("[studyContextService] query embed failed, falling back to text:", e.message);
      return null;
    });

    if (qVec) {
      const chunks = await Topic.find({
        fileId,
        isChunk: true,
        "embedding.0": { $exists: true }, // only chunks that actually have a vector
      })
        .select("title summary content level pageStart pageEnd contentType number embedding")
        .lean();

      if (chunks.length) {
        const MIN_SCORE = 0.15; // drop clearly irrelevant matches
        const ranked = chunks
          .map((c) => ({ c, score: cosineSimilarity(qVec, c.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .filter((r) => r.score >= MIN_SCORE);
        if (ranked.length) return ranked.map((r) => shape(r.c, r.score));
      }
    }

    // ── 2) Fallback: escaped keyword search ──
    const safe = String(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 120);
    const chunks = await Topic.find({
      fileId,
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { content: { $regex: safe, $options: "i" } },
      ],
    })
      .limit(limit)
      .select("title summary content level pageStart pageEnd contentType number")
      .lean();

    return chunks.map((c) => shape(c));
  } catch (err) {
    console.error("[studyContextService] getRagContext error:", err.message);
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Structure-aware retrieval: route by intent (content type) and hierarchy
// (section number), falling back to semantic vector search.
// ─────────────────────────────────────────────────────────────────────────────
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Map user phrasing → chunk contentType values produced by the pipeline.
export function detectContentTypes(message) {
  const m = String(message).toLowerCase();
  const map = [
    [/\bmcqs?\b|multiple choice|objective question/, "mcq"],
    [/\bexamples?\b|illustration|solved/, "example"],
    [/\bdefinitions?\b|define\b|what is meant/, "definition"],
    [/\bsummar(y|ise|ize)\b|recap|revision|key points|key takeaways/, "summary"],
    [/\bformulas?\b|equations?\b/, "formula"],
    [/\bexercises?\b|practice|assignment|worksheet/, "exercise"],
    [/\bprevious year|pyqs?\b|past paper/, "previous_year_question"],
    [/\btables?\b/, "table"],
    [/\bimportant points?\b/, "important_points"],
  ];
  const hits = [];
  for (const [re, type] of map) if (re.test(m)) hits.push(type);
  return [...new Set(hits)];
}

// Detect a section reference like "chapter 3", "section 3.1", or a bare "3.1".
export function detectSectionRef(message) {
  const m = String(message);
  let match = m.match(/\b(?:chapter|section|topic|unit|part)\s+(\d+(?:\.\d+)*)\b/i);
  if (match) return match[1];
  match = m.match(/\b(\d+\.\d+(?:\.\d+)*)\b/); // bare dotted number "3.1", "4.1.2"
  if (match) return match[1];
  return null;
}

/**
 * Returns { chunks, mode } where mode ∈ section|type|section+type|vector.
 * chunks carry title, number, contentType, content, pageStart/pageEnd.
 */
export async function getStructuredContext(message, fileId, limit = 6) {
  if (!message || !fileId) return { chunks: [], mode: "none" };

  const contentTypes = detectContentTypes(message);
  const secRef = detectSectionRef(message);

  const shape = (c) => ({
    title: c.title,
    number: c.number || "",
    contentType: c.contentType || "",
    content: (c.content || "").slice(0, 800),
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
  });

  try {
    if (secRef || contentTypes.length) {
      const filter = { fileId, isChunk: true };

      // Scope to a section subtree: structural node with that number + its descendants.
      if (secRef) {
        const secNodes = await Topic.find({
          fileId,
          isChunk: { $ne: true },
          $or: [{ number: secRef }, { number: { $regex: `^${escapeRegex(secRef)}\\.` } }],
        }).select("_id").lean();
        if (secNodes.length) filter.parentTopicId = { $in: secNodes.map((n) => n._id) };
      }

      if (contentTypes.length) filter.contentType = { $in: contentTypes };

      const docs = await Topic.find(filter)
        .select("title content contentType number pageStart pageEnd order")
        .sort({ order: 1 })
        .limit(limit)
        .lean();

      if (docs.length) {
        const mode = secRef && contentTypes.length ? "section+type" : secRef ? "section" : "type";
        return { chunks: docs.map(shape), mode };
      }
    }
  } catch (err) {
    console.error("[studyContextService] getStructuredContext error:", err.message);
  }

  // Fallback: semantic vector search.
  const chunks = await getRagContext(message, fileId, limit);
  return { chunks, mode: "vector" };
}
