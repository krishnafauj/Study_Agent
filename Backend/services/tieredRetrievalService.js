/**
 * tieredRetrievalService.js
 *
 * Home-first, progressively-restricted retrieval for chat.
 * (Sits beside getStructuredContext / getScopedGraphContext; replaces neither.)
 *
 *   1. PRIMARY  — full chunks, ONLY from FULL-tier sections.
 *                 Ranked by semantic score, with a boost for the chat's HOME
 *                 section ("in my home I am king") and for sections/topics the
 *                 message names explicitly (so "explain dp" from the topic-2 chat
 *                 still pulls dp content when dp is FULL).
 *   2. RELATED  — knowledge-graph prerequisites (depth 1) that live in another
 *                 FULL section: short summary so the tutor can connect ideas.
 *   3. BACKGROUND — prerequisites / explicitly-asked concepts that live in a
 *                 BRIEF ("see") or LOCKED section: definition only (≤220 chars),
 *                 never page text. This is the "teach minimally, don't refuse".
 *
 * Graph priority: prerequisites needed by HOME chunks weigh 1.5× more than those
 * needed by chunks from other sections, so each section's chat gets its own
 * graph ordering.
 */

import mongoose from "mongoose";
import Topic from "../models/topic.js";
import { embedQuery, cosineSimilarity } from "./embeddingService.js";
import { detectContentTypes, detectSectionRef } from "./studyContextService.js";
import { getPrerequisites } from "./knowledgeGraphService.js";
import { TIER, sectionOfTopic, tierOfTopic } from "./accessPolicyService.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cleanTitle = (t) => String(t || "").replace(/^\s*\d+(?:\.\d+)*\s*[.)-]?\s*/, "").trim();
const toOid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);

/** Does `message` mention `name` as a whole word/phrase? */
function mentions(message, name) {
  const n = cleanTitle(name);
  if (n.length < 2) return false;
  return new RegExp(`(^|\\W)${escapeRegex(n)}(\\W|$)`, "i").test(message);
}

/** Definition-only shape for a concept outside FULL access. */
function briefDefinition(topic) {
  let def = topic.summary && topic.summary.trim();
  // chunk "summary" holds the chunk kind (e.g. "text") — not a real definition
  if (topic.isChunk || (def && def.length < 25)) def = "";
  if (!def) {
    const kc = Array.isArray(topic.keyConcepts) ? topic.keyConcepts : [];
    def = kc.find((k) => k?.definition)?.definition || "";
  }
  if (!def) def = (topic.content || "").slice(0, 220);
  return String(def).replace(/\s+/g, " ").slice(0, 220);
}

/**
 * @param {string} message
 * @param {string} fileId
 * @param {object} access  from resolveChatAccess()
 * @param {object} [opts]
 * @returns {Promise<{primary:Array, related:Array, background:Array, mode:string}>}
 */
export async function getTieredContext(message, fileId, access, opts = {}) {
  const {
    limit = 6,
    relatedCap = 3,
    backgroundCap = 3,
    homeBoost = 1.25,     // multiplicative score boost for HOME chunks
    mentionBoost = 0.2,   // additive boost when the message names a section
    minScore = 0.15,
  } = opts;

  const out = { primary: [], related: [], background: [], mode: "none" };
  if (!message || !fileId || !access) return out;

  const msg = String(message);
  const fullSecs = access.sections.filter((s) => s.tier === TIER.FULL);
  const restrictedSecs = access.sections.filter((s) => s.tier !== TIER.FULL);
  const home = access.homeSection && access.homeSection.tier === TIER.FULL ? access.homeSection : null;
  const mentionedSecIds = new Set(access.sections.filter((s) => mentions(msg, s.title)).map((s) => s._id));

  // ── 1) PRIMARY: FULL-tier chunks only ─────────────────────────────────────
  let primary = [];
  try {
    const clauses = [];
    const fullOids = fullSecs.map((s) => toOid(s._id)).filter(Boolean);
    if (fullOids.length) clauses.push({ sectionId: { $in: fullOids } });
    // legacy chunks (no sectionId) that sit fully inside a FULL range
    for (const s of fullSecs) {
      clauses.push({ sectionId: null, pageStart: { $gte: s.pageStart, $gt: 0 }, pageEnd: { $lte: s.pageEnd } });
    }
    // owner: legacy whole-file chunks are all theirs
    if (access.isOwner) clauses.push({ sectionId: null });

    if (clauses.length) {
      const candidates = await Topic.find({ fileId: String(fileId), isChunk: true, $or: clauses })
        .select("_id title content contentType number pageStart pageEnd sectionId parentTopicId order embedding")
        .lean();

      if (candidates.length) {
        const types = detectContentTypes(msg);
        const secRef = detectSectionRef(msg);
        let secParents = null;
        if (secRef) {
          const nodes = await Topic.find({
            fileId: String(fileId),
            isChunk: { $ne: true },
            $or: [{ number: secRef }, { number: { $regex: `^${escapeRegex(secRef)}\\.` } }],
          }).select("_id").lean();
          if (nodes.length) secParents = new Set(nodes.map((n) => String(n._id)));
        }

        const qVec = await embedQuery(msg).catch(() => null);
        const words = qVec
          ? []
          : msg.toLowerCase().split(/\W+/).filter((w) => w.length >= 4).slice(0, 12);

        const scored = candidates.map((c) => {
          let s = 0;
          if (qVec && c.embedding?.length) s = cosineSimilarity(qVec, c.embedding);
          else if (words.length) {
            const hay = `${c.title} ${c.content}`.toLowerCase();
            s = words.filter((w) => hay.includes(w)).length / words.length;
          }
          if (types.length && types.includes(c.contentType)) s += 0.15;
          if (secParents && c.parentTopicId && secParents.has(String(c.parentTopicId))) s += 0.25;

          const sec = sectionOfTopic(c, access);
          const isHome = !!(home && sec && sec._id === home._id);
          if (sec && mentionedSecIds.has(sec._id)) s += mentionBoost; // explicit ask wins
          if (isHome) s = s * homeBoost + 0.03;                       // home is king
          return { c, s, isHome, sec };
        });

        primary = scored
          .filter((r) => r.s >= minScore)
          .sort((a, b) => b.s - a.s)
          .slice(0, limit);
        out.mode = qVec ? "tiered:vector" : "tiered:keyword";
      }
    }
  } catch (err) {
    console.error("[tieredRetrieval] primary error:", err.message);
  }

  out.primary = primary.map(({ c, isHome, sec }) => ({
    _id: String(c._id),
    title: c.title,
    number: c.number || "",
    contentType: c.contentType || "",
    content: (c.content || "").slice(0, 800),
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    isHome,
    sectionTitle: sec?.title || "",
  }));

  // ── 2/3) Knowledge-graph prerequisites (depth 1), home-weighted ───────────
  const background = new Map(); // topicId -> entry
  const related = new Map();
  try {
    if (primary.length) {
      const primaryIds = primary.map((p) => p.c._id);
      const primarySet = new Set(primaryIds.map(String));
      const homeSet = new Set(primary.filter((p) => p.isHome).map((p) => String(p.c._id)));

      const prereqs = await getPrerequisites(String(fileId), primaryIds, { cap: 15 });
      for (const p of prereqs) {
        const t = p.topic;
        const id = String(t._id);
        if (primarySet.has(id)) continue;
        const neededByHome = (p.dependents || []).some((d) => homeSet.has(String(d)));
        const weight = (p.weight || 1) * (neededByHome ? 1.5 : 1);
        const sec = sectionOfTopic(t, access);
        const tier = tierOfTopic(t, access);
        const entry = {
          title: cleanTitle(t.title) || t.title,
          sectionTitle: sec?.title || "another part of the book",
          tier,
          weight,
          via: (p.evidence || []).slice(0, 3),
        };
        if (tier === TIER.FULL) {
          related.set(id, { ...entry, summary: String(t.summary || briefDefinition(t)).slice(0, 300) });
        } else {
          background.set(id, { ...entry, definition: briefDefinition(t), reason: "prerequisite" });
        }
      }
    }
  } catch (err) {
    console.error("[tieredRetrieval] graph error:", err.message);
  }

  // ── 3b) Student explicitly asks about a BRIEF/LOCKED concept ──────────────
  //       → definition only (never chunks/page text).
  try {
    if (restrictedSecs.length) {
      const rOids = restrictedSecs.map((s) => toOid(s._id)).filter(Boolean);
      const nodes = await Topic.find({
        fileId: String(fileId),
        isChunk: { $ne: true },
        sectionId: { $in: rOids },
      })
        .select("_id title summary keyConcepts content sectionId pageStart pageEnd level")
        .lean();

      for (const n of nodes) {
        const id = String(n._id);
        if (background.has(id)) continue;
        const hitTitle = mentions(msg, n.title);
        const hitKc = !hitTitle && (n.keyConcepts || []).some((k) => {
          const name = k?.concept || k?.name || k?.term;
          return name && cleanTitle(name).length >= 4 && mentions(msg, name);
        });
        if (!hitTitle && !hitKc) continue;
        const sec = sectionOfTopic(n, access);
        background.set(id, {
          title: cleanTitle(n.title) || n.title,
          sectionTitle: sec?.title || "a restricted part of the book",
          tier: sec?.tier || TIER.LOCKED,
          weight: hitTitle ? 100 : 50, // direct asks outrank graph hops
          definition: briefDefinition(n),
          reason: "asked",
        });
      }
    }
  } catch (err) {
    console.error("[tieredRetrieval] restricted-mention error:", err.message);
  }

  out.related = [...related.values()].sort((a, b) => b.weight - a.weight).slice(0, relatedCap);
  out.background = [...background.values()].sort((a, b) => b.weight - a.weight).slice(0, backgroundCap);
  return out;
}

/**
 * Outline titles per section, for the prompt's access map.
 * @returns {Promise<Map<string, string[]>>} sectionId -> titles (level ≤ 1)
 */
export async function getSectionOutlines(fileId, sections, perSection = 15) {
  const map = new Map();
  const oids = sections.map((s) => toOid(s._id)).filter(Boolean);
  if (!oids.length) return map;
  const nodes = await Topic.find({
    fileId: String(fileId),
    isChunk: { $ne: true },
    sectionId: { $in: oids },
    level: { $lte: 1 },
  })
    .sort({ level: 1, order: 1 })
    .select("title sectionId")
    .lean();
  for (const n of nodes) {
    const k = String(n.sectionId);
    if (!map.has(k)) map.set(k, []);
    const arr = map.get(k);
    if (arr.length < perSection) arr.push(n.title);
  }
  return map;
}

export default { getTieredContext, getSectionOutlines };
