import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Which PermissionSection produced this topic/chunk (per-section parsing).
    // null for topics created by the legacy whole-document pipeline.
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PermissionSection",
      default: null,
      index: true,
    },
    // Hierarchical structure
    level: {
      type: Number, // 0 = main topic, 1 = subtopic, 2 = sub-subtopic, etc.
      required: true,
    },
    parentTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      default: null, // null for main topics
    },
    // Content
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      default: "",
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      default: [], // 1536-dimensional vector from OpenAI
    },
    // LLM Document Understanding
    keyConcepts: {
      type: Array, // [{ concept, definition }]
      default: [],
    },
    formulas: {
      type: Array, // [{ name, expression, explanation }]
      default: [],
    },
    mcqs: {
      type: Array, // [{ question, options, correctAnswer, explanation }]
      default: [],
    },
    // Dotted section number for display: "1", "1.2", "4.1.2"
    number: {
      type: String,
      default: "",
    },
    // Content classification (definition/example/formula/table/mcq/...) for chunks
    contentType: {
      type: String,
      default: "",
    },
    // true = retrievable leaf chunk (not a structural outline node / flashcard)
    isChunk: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Metadata
    pageStart: {
      type: Number,
      default: 0,
    },
    pageEnd: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number, // Order within parent
      default: 0,
    },
    childCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
topicSchema.index({ fileId: 1, level: 1 });
topicSchema.index({ parentTopicId: 1 });
topicSchema.index({ fileId: 1, userId: 1 });
topicSchema.index({ userId: 1, level: 1 });

const Topic = mongoose.model("Topic", topicSchema);

export default Topic;
