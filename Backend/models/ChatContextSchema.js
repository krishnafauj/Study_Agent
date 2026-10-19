import mongoose from "mongoose";

const ChatContextSchema = new mongoose.Schema({

  chatId: {
    type: String,
    required: true,
    unique: true
  },

  userId: mongoose.Schema.Types.ObjectId,

  fileId: { type: String, default: null },

  folderId: { type: String, default: null },

  summary: String,

  // Fingerprint of the caller's section access when this memory was written.
  // If the owner changes permissions, memory is reset so old answers don't leak.
  accessSig: { type: String, default: null },

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
// ChatContextSchema.index({ chatId: 1 }); // unique: true in schema already creates this index
export default mongoose.model("ChatContext", ChatContextSchema);