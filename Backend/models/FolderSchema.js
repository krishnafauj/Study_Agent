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
      marks: [{ type: String }],
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