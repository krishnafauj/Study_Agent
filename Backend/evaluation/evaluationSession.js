/**
 * evaluationSession.js — Mongo model for one viva attempt.
 * referenceAnswer / keyPoints / sourceExcerpt are server-only:
 * never send them to the client before the question is answered.
 */
import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    topicTitle: String,
    question: { type: String, required: true },
    referenceAnswer: String,
    keyPoints: [String],
    sourceExcerpt: String,

    // filled after the student answers
    transcript: { type: String, default: null },
    score: { type: Number, default: null },
    verdict: { type: String, default: null },
    coveredPoints: [String],
    missingPoints: [String],
    feedback: { type: String, default: null },
    answeredAt: { type: Date, default: null },
  },
  { _id: false }
);

const evaluationSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    fileId: { type: String, required: true, index: true },
    sectionId: { type: String, default: null },
    assignmentId: { type: String, default: null, index: true },
    userEmail: { type: String, default: "" },
    answerTimeSec: { type: Number, default: 90 },
    fullscreenExits: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },

    questions: [questionSchema],
    currentIndex: { type: Number, default: 0 },

    totalScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    report: {
      summary: String,
      strengths: [String],
      weakTopics: [String],
      nextSteps: [String],
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const EvaluationSession = mongoose.model("EvaluationSession", evaluationSessionSchema);

export default EvaluationSession;
