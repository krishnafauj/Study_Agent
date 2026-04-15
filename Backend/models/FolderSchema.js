import mongoose from "mongoose";

const FolderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  fileId: {
    type: String,
    required: true
  },

  fileName: String,

  topics: [
    {
      topicId: String,
      topicName: String,
      subTopics: [String],
      marks: [
        {
          score: { type: Number, required: true },      // marks obtained
          total: { type: Number, required: true },      // out of
          attemptedAt: { type: Date, default: Date.now }
        }
      ],
      performanceScore: { type: Number, default: null }, // avg percentage (0-100), null = not attempted
      weakFlag: { type: Boolean, default: false },        // auto-set when performanceScore < 70
      embedding: [Number]
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

FolderSchema.index({ fileId: 1 });

export default mongoose.model("Folder", FolderSchema);