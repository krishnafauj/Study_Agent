import ChatSession from "../../models/chatSession.js";
import ChatMessage from "../../models/chatMessage.js";

/**
 * POST /api/chat/:chatId/init
 * Called when a chat page is opened — creates a ChatSession placeholder
 * with title "New Chat" if one doesn't already exist.
 * Body: { fileId?, folderId?, fileName? }
 */
export const initChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;
    const { fileId, folderId, fileName } = req.body || {};

    const updateData = { $setOnInsert: { title: "New Chat" } };
    
    // Add file/folder context if provided
    if (fileId) updateData.$setOnInsert.fileId = fileId;
    if (folderId) updateData.$setOnInsert.folderId = folderId;
    if (fileName) updateData.$setOnInsert.fileName = fileName;

    const session = await ChatSession.findOneAndUpdate(
      { chatId, userId },
      updateData,
      { upsert: true, returnDocument: "after" }
    );

    res.json({
      success: true,
      title: session.title,
      fileId: session.fileId,
      folderId: session.folderId,
      fileName: session.fileName,
    });

  } catch (error) {
    console.error("Init chat error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to init chat",
    });
  }
};


/**
 * GET /api/chats
 * Returns all chat sessions for the authenticated user, organized by file/folder.
 * Query params: fileId?, folderId? (to filter chats)
 */
export const getChatSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId, folderId } = req.query;

    const query = { userId };
    if (fileId) query.fileId = fileId;
    if (folderId) query.folderId = folderId;

    const sessions = await ChatSession.find(query)
      .sort({ updatedAt: -1 })
      .select("chatId title updatedAt createdAt fileId folderId fileName")
      .lean();

    // Organize chats by file/folder
    const organized = {
      global: [], // chats without file/folder context
      byFile: {}, // organized by fileId
      byFolder: {}, // organized by folderId
    };

    sessions.forEach((chat) => {
      if (!chat.fileId && !chat.folderId) {
        organized.global.push(chat);
      } else if (chat.fileId) {
        if (!organized.byFile[chat.fileId]) {
          organized.byFile[chat.fileId] = [];
        }
        organized.byFile[chat.fileId].push(chat);
      } else if (chat.folderId) {
        if (!organized.byFolder[chat.folderId]) {
          organized.byFolder[chat.folderId] = [];
        }
        organized.byFolder[chat.folderId].push(chat);
      }
    });

    res.json({
      success: true,
      chats: sessions, // flat array (for backward compatibility)
      organized, // organized structure
    });

  } catch (error) {
    console.error("Get chat sessions error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chats",
    });
  }
};


/**
 * GET /api/chats/file/:fileId
 * Returns all chat sessions for a specific file
 */
export const getChatsByFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId } = req.params;

    const sessions = await ChatSession.find({ userId, fileId })
      .sort({ updatedAt: -1 })
      .select("chatId title updatedAt createdAt fileName fileId")
      .lean();

    res.json({
      success: true,
      chats: sessions,
      fileId,
    });

  } catch (error) {
    console.error("Get chats by file error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chats for file",
    });
  }
};


/**
 * GET /api/chats/folder/:folderId
 * Returns all chat sessions for a specific folder
 */
export const getChatsByFolder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folderId } = req.params;

    const sessions = await ChatSession.find({ userId, folderId })
      .sort({ updatedAt: -1 })
      .select("chatId title updatedAt createdAt fileName fileId folderId")
      .lean();

    res.json({
      success: true,
      chats: sessions,
      folderId,
    });

  } catch (error) {
    console.error("Get chats by folder error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chats for folder",
    });
  }
};


/**
 * GET /api/chat/:chatId/title
 * Returns the title for a single chat session.
 */
export const getChatTitle = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    const session = await ChatSession.findOne({ chatId, userId })
      .select("title")
      .lean();

    if (!session) {
      return res.json({
        success: true,
        title: "New Chat",
      });
    }

    res.json({
      success: true,
      title: session.title,
    });

  } catch (error) {
    console.error("Get chat title error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch title",
    });
  }
};


/**
 * PATCH /api/chat/:chatId/title
 * Update the title of a chat session.
 * Body: { title: string }
 */
export const updateChatTitle = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const session = await ChatSession.findOneAndUpdate(
      { chatId, userId },
      { $set: { title: title.trim().slice(0, 80) } },
      { returnDocument: "after" }
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Chat not found",
      });
    }

    res.json({
      success: true,
      title: session.title,
    });

  } catch (error) {
    console.error("Update chat title error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update title",
    });
  }
};


/**
 * DELETE /api/chat/:chatId
 * Delete a chat session and all its messages.
 */
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    const session = await ChatSession.findOneAndDelete({
      chatId,
      userId,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Chat not found",
      });
    }

    // delete all messages for the chat
    await ChatMessage.deleteMany({
      chatId,
      userId,
    });

    res.json({
      success: true,
      message: "Chat deleted successfully",
    });

  } catch (error) {
    console.error("Delete chat error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete chat",
    });
  }
};