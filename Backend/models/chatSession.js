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

    // File or folder context for this chat
    fileId: {
      type: String,
      default: null, // null if global chat, otherwise fileId
      index: true,
    },

    folderId: {
      type: String,
      default: null, // null if no folder context, otherwise folderId
      index: true,
    },

    fileName: {
      type: String,
      default: null, // Store filename for quick display
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

// Index for fast "list all chats for user sorted by recent"
chatSessionSchema.index({ userId: 1, updatedAt: -1 });

// Index for finding chats by file/folder
chatSessionSchema.index({ userId: 1, fileId: 1, updatedAt: -1 });
chatSessionSchema.index({ userId: 1, folderId: 1, updatedAt: -1 });

const ChatSession = mongoose.model("ChatSession", chatSessionSchema);

export default ChatSession;
