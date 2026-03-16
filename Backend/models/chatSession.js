import mongoose from "mongoose";

const chatSessionSchema = new mongoose.Schema(
  {
    chatId: {
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

    // Auto-generated from the first user message (first 60 chars)
    title: {
      type: String,
      default: "New Chat",
    },
  },
  {
    timestamps: true, // createdAt + updatedAt (updatedAt tracks last message)
  }
);

// Index for fast "list all chats for user sorted by recent" query
chatSessionSchema.index({ userId: 1, updatedAt: -1 });

const ChatSession = mongoose.model("ChatSession", chatSessionSchema);

export default ChatSession;
