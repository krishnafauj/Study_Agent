import ChatMessage from "../../models/chatMessage.js";

/**
 * GET /api/chat/:chatId/history?page=1&limit=50
 * Returns paginated messages for a chat, oldest-first within the page.
 * Most-recent page is page=1.
 */
export const getChatHistory = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    // Count total messages for this chat
    const total = await ChatMessage.countDocuments({ chatId, userId });

    // Fetch the page — sorted newest first so skip/limit gives you the right slice,
    // then reverse so the array is oldest-first (correct display order).
    const messages = await ChatMessage.find({ chatId, userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("role content createdAt")
      .lean();

    // Reverse to get chronological (oldest → newest) order
    messages.reverse();

    res.json({
      success: true,
      messages,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch history" });
  }
};
