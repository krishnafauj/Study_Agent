/**
 * scopedRetrievalService.js
 *
 * The NEW retrieval method for page-range-scoped chat. Sits beside
 * studyContextService.getStructuredContext — it does NOT replace it.
 *
 * Guarantees the "don't overcross" rule:
 *   1. Primary answer content comes ONLY from the caller's approved page ranges.
 *   2. A concept from outside the range is injected ONLY if a prerequisite edge
 *      points from it to an in-scope node.
 *   3. Only that node's short definition/summary crosses — never the page text.
 *   4. Depth = 1, capped (top-N by weight).
 *   5. Borrowed prerequisites are context only — never browsable.
 *
 * `approvedSections` MUST be derived server-side from the caller's SectionGrant,
 * never taken from client input. See accessRoutes.js.
 *
 * ── DATA DEPENDENCY ──────────────────────────────────────────────────────────
 * Scoping is by page number, so it requires chunks to carry real pageStart/
 * pageEnd. The full book-breaker extractor populates these; the reduced
 * pdf-parse pipeline (integration/src/pipeline.js) does NOT set per-chunk pages
 * yet. Chunks with unknown pages (pageStart/pageEnd = 0) are treated as
 * out-of-scope and excluded — safer for access control. If your data lacks page
 * numbers, populate them at ingest (or switch sections to a section-number /
 * parentTopicId subtree model — see SCOPED_ACCESS_GRAPH_DESIGN.md §8).
 */

import Topic from "../models/topic.js";
import { embedQuery, cosineSimilarity } from "./embeddingService.js";
import { detectContentTypes, detectSectionRef } from "./studyContextService.js";
import { getPrerequisites } from "./knowledgeGraphService.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Normalize [{pageStart,pageEnd}] → clean, valid ranges. */
function normalizeRanges(approvedSections = []) {
  return (approvedSections || [])
    .map((s) => ({
      pageStart: Number(s.pageStart),
      pageEnd: Number(s.pageEnd),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.pageStart) &&
        Number.isFinite(r.pageEnd) &&
        r.pageStart > 0 &&
        r.pageEnd >= r.pageStart
    );
}

/** Mongo $or matching a chunk that sits FULLY inside one approved range. */
function scopeOrClause(ranges) {
  return ranges.map((r) => ({
    pageStart: { $gte: r.pageStart, $gt: 0 },
    pageEnd: { $lte: r.pageEnd },
  }));
}

/** Is a node fully inside any approved range? (unknown pages ⇒ false) */
function inScope(node, ranges) {
  const ps = node.pageStart ?? 0;
  const pe = node.pageEnd ?? 0;
  if (!ps || !pe) return false;
  return ranges.some((r) => ps >= r.pageStart && pe <= r.pageEnd);
}

/** Public shape for a primary (in-scope) chunk. */
function shapePrimary(c) {
  return {
    title: c.title,
    number: c.number || "",
    contentType: c.contentType || "",
    content: (c.content || "").slice(0, 800),
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
  };
}

/**
 * Minimal shape for a borrowed prerequisite. Definition-only, never page text.
 * Preference: summary → first keyConcept definition → hard-truncated snippet.
 * No page numbers are exposed (avoids revealing where in the restricted region
 * the concept lives).
 */
function shapePrerequisite({ topic, evidence }) {
  let definition = topic.summary && topic.summary.trim();
  if (!definition) {
    const kc = Array.isArray(topic.keyConcepts) ? topic.keyConcepts : [];
    definition = kc.find((k) => k?.definition)?.definition || "";
  }
  if (!definition) definition = (topic.content || "").slice(0, 220);
  return {
    title: topic.title,
    definition: String(definition).slice(0, 220),
    why: evidence?.length ? `referenced via: ${evidence.join(", ")}` : "prerequisite",
    borrowed: true,
  };
}

/**
 * Scoped retrieval + edge-justified prerequisites.
 *
 * @param {string} message
 * @param {string} fileId
 * @param {Array<{pageStart:number,pageEnd:number}>} approvedSections
 * @param {object} [opts]
 * @param {number} [opts.limit=6]      max primary chunks
 * @param {number} [opts.prereqCap=3]  max borrowed prerequisites
 * @returns {Promise<{scope:Array, primary:Array, prerequisites:Array, mode:string}>}
 */
export async function getScopedGraphContext(message, fileId, approvedSections, opts = {}) {
  const { limit = 6, prereqCap = 3 } = opts;
  if (!message || !fileId) return { scope: [], primary: [], prerequisites: [], mode: "none" };

  const ranges = normalizeRanges(approvedSections);
  if (!ranges.length) return { scope: [], primary: [], prerequisites: [], mode: "no-scope" };

  const scopeOr = scopeOrClause(ranges);
  const scopedBase = { fileId, isChunk: true, $and: [{ $or: scopeOr }] };

  let primaryDocs = [];
  let mode = "vector";

  try {
    const contentTypes = detectContentTypes(message);
    const secRef = detectSectionRef(message);

    // ── 1) Structure-aware within scope (section number and/or content type) ──
    if (secRef || contentTypes.length) {
      const filter = { ...scopedBase };

      if (secRef) {
        const secNodes = await Topic.find({
          fileId,
          isChunk: { $ne: true },
          $or: [
            { number: secRef },
            { number: { $regex: `^${escapeRegex(secRef)}\\.` } },
          ],
        })
          .select("_id")
          .lean();
        if (secNodes.length) filter.parentTopicId = { $in: secNodes.map((n) => n._id) };
      }
      if (contentTypes.length) filter.contentType = { $in: contentTypes };

      const docs = await Topic.find(filter)
        .select("title content contentType number pageStart pageEnd order")
        .sort({ order: 1 })
        .limit(limit)
        .lean();

      if (docs.length) {
        primaryDocs = docs;
        mode = secRef && contentTypes.length ? "section+type" : secRef ? "section" : "type";
      }
    }

    // ── 2) Semantic within scope ──
    if (!primaryDocs.length) {
      const qVec = await embedQuery(message).catch(() => null);
      if (qVec) {
        const chunks = await Topic.find({
          ...scopedBase,
          "embedding.0": { $exists: true },
        })
          .select("title content level pageStart pageEnd contentType number embedding")
          .lean();

        if (chunks.length) {
          const MIN_SCORE = 0.15;
          const ranked = chunks
            .map((c) => ({ c, score: cosineSimilarity(qVec, c.embedding) }))
            .sort((a, b) => b.score - a.score)
            .filter((r) => r.score >= MIN_SCORE)
            .slice(0, limit);
          if (ranked.length) {
            primaryDocs = ranked.map((r) => r.c);
            mode = "vector";
          }
        }
      }
    }

    // ── 3) Keyword fallback within scope ──
    if (!primaryDocs.length) {
      const safe = escapeRegex(String(message)).slice(0, 120);
      primaryDocs = await Topic.find({
        ...scopedBase,
        $or: [
          { title: { $regex: safe, $options: "i" } },
          { content: { $regex: safe, $options: "i" } },
        ],
      })
        .select("title content contentType number pageStart pageEnd")
        .limit(limit)
        .lean();
      mode = "keyword";
    }
  } catch (err) {
    console.error("[scopedRetrieval] primary retrieval error:", err.message);
  }

  // ── 4) Edge-justified prerequisites (depth 1, capped, out-of-scope only) ──
  let prerequisites = [];
  try {
    if (primaryDocs.length) {
      const primaryIds = primaryDocs.map((d) => d._id).filter(Boolean);
      const prereqs = await getPrerequisites(fileId, primaryIds, { cap: prereqCap * 2 });
      prerequisites = prereqs
        .filter((p) => p.topic && !inScope(p.topic, ranges)) // ONLY borrow from outside scope
        .slice(0, prereqCap)
        .map(shapePrerequisite);
    }
  } catch (err) {
    console.error("[scopedRetrieval] prerequisite pull error:", err.message);
  }

  return {
    scope: ranges,
    primary: primaryDocs.map(shapePrimary),
    prerequisites,
    mode,
  };
}

export default { getScopedGraphContext };
