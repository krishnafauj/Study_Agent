import mongoose from "mongoose";

const processingProgressSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "extracting", "analyzing", "embedding", "completed", "failed"],
      default: "pending",
    },
    progress: {
      type: Number, // 0-10 scale
      default: 0,
    },
    totalPages: {
      type: Number,
      default: 0,
    },
    processedPages: {
      type: Number,
      default: 0,
    },
    totalTopics: {
      type: Number,
      default: 0,
    },
    topicsCreated: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const ProcessingProgress = mongoose.model(
  "ProcessingProgress",
  processingProgressSchema
);

export default ProcessingProgress;
