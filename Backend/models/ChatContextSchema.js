import mongoose from "mongoose";

const ChatContextSchema = new mongoose.Schema({

  chatId: {
    type: String,
    required: true,
    unique: true
  },

  userId: mongoose.Schema.Types.ObjectId,

  fileId: mongoose.Schema.Types.ObjectId,

  summary: String,

  recentMessages: [
    {
      role: String,
      content: String
    }
  ],

  importantContext: [
    {
      text: String,
      embedding: [Number]
    }
  ],

  updatedAt: {
    type: Date,
    default: Date.now
  }

});

// 👇 ADD INDEXES HERE
ChatContextSchema.index({ chatId: 1 });
ChatContextSchema.index({ fileId: 1 });

export default mongoose.model("ChatContext", ChatContextSchema);