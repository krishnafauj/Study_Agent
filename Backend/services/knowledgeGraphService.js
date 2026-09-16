/**
 * knowledgeGraphService.js
 *
 * Builds and traverses the per-file knowledge graph of prerequisite edges.
 *
 *  - Nodes  = existing `Topic` documents (no new node collection).
 *  - Edges  = `ConceptEdge` documents: fromTopicId --prerequisite--> toTopicId.
 *
 * Edge building runs ONCE, right after PDF processing. The scoped chat only
 * READS edges (getPrerequisites) — it never builds and never calls an LLM.
 */

import Topic from "../models/topic.js";
import ConceptEdge from "../models/conceptEdge.js";

// ───────────────────────── helpers ─────────────────────────

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "your",
  "introduction", "overview", "summary", "chapter", "section", "topic", "unit",
  "part", "example", "examples", "exercise", "notes", "table", "figure",
]);

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Concept names a node can be referenced BY: its title + keyConcept names. */
function nodeNameTokens(node) {
  const tokens = [];
  if (node.title) tokens.push(String(node.title));
  const kc = Array.isArray(node.keyConcepts) ? node.keyConcepts : [];
  for (const k of kc) {
    const name = k?.concept || k?.name || k?.term;
    if (name) tokens.push(String(name));
  }
  // Clean: strip leading numbering ("1.2 Inertia" -> "Inertia"), dedupe, filter.
  const seen = new Set();
  const out = [];
  for (let t of tokens) {
    t = t.replace(/^\s*\d+(?:\.\d+)*\s*/, "").trim();
    const key = t.toLowerCase();
    if (t.length < 4) continue;
    if (STOPWORDS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Text of a node we scan to see which earlier concepts it mentions. */
function nodeText(node) {
  return `${node.title || ""}\n${node.summary || ""}\n${node.content || ""}`;
}

/** node A comes before node B in reading order. */
function isEarlier(a, b) {
  const ap = a.pageStart ?? 0;
  const bp = b.pageStart ?? 0;
  if (ap !== bp) return ap < bp;
  return (a.order ?? 0) < (b.order ?? 0);
}

// ───────────────────────── build ─────────────────────────

/**
 * Build prerequisite edges for one file.
 *
 * @param {string} fileId
 * @param {object} [opts]
 * @param {boolean} [opts.useLlm=false]  refine ambiguous edges with an LLM (surgical)
 * @param {number}  [opts.maxInDegree=8] keep at most N incoming prerequisites per node
 * @param {number}  [opts.minTokenLen=4]
 * @param {(cand:object[])=>Promise<object[]>} [opts.llmRefine]  optional injected refiner
 * @returns {Promise<{fileId:string, nodes:number, edges:number, source:string}>}
 */
export async function buildConceptEdges(fileId, opts = {}) {
  const {
    useLlm = false,
    maxInDegree = 8,
    llmRefine = null,
  } = opts;

  if (!fileId) return { fileId, nodes: 0, edges: 0, source: "none" };

  // Load all concept-bearing nodes for this file.
  const nodes = await Topic.find({ fileId })
    .select("_id title summary content keyConcepts pageStart order isChunk")
    .lean();

  if (!nodes.length) return { fileId, nodes: 0, edges: 0, source: "none" };

  // Precompute name tokens + compiled matchers per node.
  const enriched = nodes.map((n) => {
    const names = nodeNameTokens(n);
    return {
      node: n,
      names,
      matchers: names.map((t) => ({
        term: t,
        re: new RegExp(`\\b${escapeRegex(t)}\\b`, "i"),
      })),
      text: nodeText(n),
    };
  });

  // Deterministic pass: B references an earlier A's name → edge A -> B.
  // candidates keyed by "from|to"
  const candidates = new Map();
  for (const B of enriched) {
    if (!B.text || B.text.trim().length < 20) continue;
    for (const A of enriched) {
      if (A.node._id.equals(B.node._id)) continue;
      if (!isEarlier(A.node, B.node)) continue;
      let weight = 0;
      const evidence = [];
      for (const m of A.matchers) {
        if (m.re.test(B.text)) {
          weight += 1;
          evidence.push(m.term);
        }
      }
      if (weight > 0) {
        candidates.set(`${A.node._id}|${B.node._id}`, {
          fileId,
          fromTopicId: A.node._id,
          toTopicId: B.node._id,
          relation: "prerequisite",
          weight,
          source: "keyword",
          evidence: evidence.slice(0, 5),
        });
      }
    }
  }

  let edges = [...candidates.values()];

  // Optional surgical LLM refine of ambiguous edges (same idea as contentType.js).
  // Pass your own refiner via opts.llmRefine to avoid coupling to a specific LLM
  // wrapper here. It receives the candidate edges and returns the ones to keep
  // (optionally re-weighted / marked source:"llm"|"hybrid").
  if (useLlm && typeof llmRefine === "function") {
    try {
      const refined = await llmRefine(edges);
      if (Array.isArray(refined)) edges = refined;
    } catch (err) {
      console.warn("[knowledgeGraph] llmRefine failed, keeping keyword edges:", err.message);
    }
  }

  // Cap in-degree: keep the strongest N prerequisites per `to` node.
  const byTo = new Map();
  for (const e of edges) {
    const k = String(e.toTopicId);
    if (!byTo.has(k)) byTo.set(k, []);
    byTo.get(k).push(e);
  }
  const capped = [];
  for (const list of byTo.values()) {
    list.sort((a, b) => b.weight - a.weight);
    capped.push(...list.slice(0, maxInDegree));
  }

  // Replace edges for this file atomically-ish (rebuild is idempotent).
  await ConceptEdge.deleteMany({ fileId });
  if (capped.length) {
    // ordered:false so a stray duplicate never aborts the whole insert.
    await ConceptEdge.insertMany(capped, { ordered: false }).catch((err) => {
      console.warn("[knowledgeGraph] insertMany partial:", err.message);
    });
  }

  return {
    fileId,
    nodes: nodes.length,
    edges: capped.length,
    source: useLlm ? "hybrid" : "keyword",
  };
}

// ───────────────────────── traverse ─────────────────────────

/**
 * Direct prerequisites of a set of in-scope nodes. Depth is HARD-CAPPED at 1 to
 * guarantee no transitive walk out of the approved range ("don't overcross").
 *
 * @param {string} fileId
 * @param {string[]|ObjectId[]} toTopicIds  in-scope node ids we found relevant
 * @param {object} [opts]
 * @param {number} [opts.cap=3]  max prerequisites returned (top by weight)
 * @returns {Promise<Array<{ topic, weight, evidence }>>}  topic = full prereq node
 */
export async function getPrerequisites(fileId, toTopicIds, opts = {}) {
  const { cap = 3 } = opts;
  if (!fileId || !toTopicIds?.length) return [];

  const edges = await ConceptEdge.find({
    fileId,
    relation: "prerequisite",
    toTopicId: { $in: toTopicIds },
  })
    .select("fromTopicId weight evidence")
    .lean();

  if (!edges.length) return [];

  // Aggregate by prerequisite node, summing weight if multiple in-scope nodes need it.
  const agg = new Map();
  for (const e of edges) {
    const k = String(e.fromTopicId);
    const cur = agg.get(k) || { fromTopicId: e.fromTopicId, weight: 0, evidence: [] };
    cur.weight += e.weight || 1;
    if (e.evidence?.length) cur.evidence.push(...e.evidence);
    agg.set(k, cur);
  }

  const top = [...agg.values()].sort((a, b) => b.weight - a.weight).slice(0, cap);
  const ids = top.map((t) => t.fromTopicId);

  const prereqNodes = await Topic.find({ _id: { $in: ids } })
    .select("_id title summary content keyConcepts pageStart pageEnd number")
    .lean();
  const nodeById = new Map(prereqNodes.map((n) => [String(n._id), n]));

  return top
    .map((t) => ({
      topic: nodeById.get(String(t.fromTopicId)),
      weight: t.weight,
      evidence: [...new Set(t.evidence)].slice(0, 5),
    }))
    .filter((r) => r.topic);
}

export default { buildConceptEdges, getPrerequisites };
