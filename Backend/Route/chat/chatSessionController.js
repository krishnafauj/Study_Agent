import ChatSession from "../../models/chatSession.js";
import ChatMessage from "../../models/chatMessage.js";

/**
 * POST /api/chat/:chatId/init
 * Called when a chat page is opened — creates a ChatSession placeholder
 * with title "New Chat" if one doesn't already exist.
 */
export const initChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    const session = await ChatSession.findOneAndUpdate(
      { chatId, userId },
      { $setOnInsert: { title: "New Chat" } },
      { upsert: true, returnDocument: "after" }
    );

    res.json({
      success: true,
      title: session.title,
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
 * Returns all chat sessions for the authenticated user, sorted by most recent.
 */
export const getChatSessions = async (req, res) => {
  try {
    const userId = req.user.userId;

    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 })
      .select("chatId title updatedAt createdAt")
      .lean();

    res.json({
      success: true,
      chats: sessions,
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