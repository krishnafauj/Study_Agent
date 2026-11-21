/**
 * vivaAssignment.js — owner assigns a section's voice viva to students.
 * Group members are expanded to emails at creation time (snapshot).
 */
import mongoose from "mongoose";

const vivaAssignmentSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    fileId: { type: String, required: true, index: true },
    sectionId: { type: String, default: null },
    sectionTitle: { type: String, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    count: { type: Number, default: 5, min: 1, max: 10 },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    answerTimeSec: { type: Number, default: 90, min: 20, max: 300 }, // max speaking time per answer
    groupIds: [String],
    studentEmails: { type: [String], index: true }, // lowercase
  },
  { timestamps: true }
);

export default mongoose.models.VivaAssignment || mongoose.model("VivaAssignment", vivaAssignmentSchema);
