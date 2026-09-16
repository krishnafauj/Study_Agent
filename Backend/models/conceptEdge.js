import mongoose from "mongoose";

/**
 * ConceptEdge — an edge in the file's knowledge graph.
 *
 * Nodes are existing `Topic` documents; this collection only stores the LINKS
 * between them. A "prerequisite" edge means: the `to` concept depends on the
 * `from` concept.
 *
 *     Inertia (page 5)  ── prerequisite ──▶  Newton's 2nd Law (page 15)
 *     fromTopicId                             toTopicId
 *
 * At scoped chat time we look up edges by `toTopicId` (an in-scope node) to find
 * which earlier concepts it needs — this is the hot query, hence the index.
 */
const conceptEdgeSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, index: true },
    fromTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    }, // the prerequisite (earlier concept)
    toTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    }, // the dependent (later concept)
    relation: { type: String, default: "prerequisite" },
    weight: { type: Number, default: 1 }, // strength of dependency
    source: {
      type: String,
      enum: ["keyword", "llm", "hybrid"],
      default: "keyword",
    },
    evidence: { type: [String], default: [] }, // matched terms, for audit/debug
  },
  { timestamps: true }
);

// Hot lookup: "what does this in-scope node depend on?"
conceptEdgeSchema.index({ fileId: 1, toTopicId: 1 });
// Prevent duplicate edges between the same pair.
conceptEdgeSchema.index(
  { fileId: 1, fromTopicId: 1, toTopicId: 1, relation: 1 },
  { unique: true }
);

const ConceptEdge = mongoose.model("ConceptEdge", conceptEdgeSchema);

export default ConceptEdge;
