import express from "express";
const router = express.Router();
import { chatStreamHandler } from "./chat/chatStreamController.js";
import { getChatHistory } from "./chat/chatHistoryController.js";
import { getChatSessions, getChatTitle, updateChatTitle, deleteChat, initChat } from "./chat/chatSessionController.js";

import authRoutes from "./Auth/auth.js";
import fileRoutes from "./fileRoutes.js";
import { verifyToken } from "../middleware/authMiddleware.js";
console.log("Route loaded");
router.use("/auth", authRoutes);

console.log('auth calling');
router.use(verifyToken);

// File storage endpoints (S3-backed)
router.use(fileRoutes);

// Chat streaming
router.post("/chat-stream", chatStreamHandler);

// Chat history — GET /api/chat/:chatId/history?page=1&limit=50
router.get("/chat/:chatId/history", getChatHistory);

// Chat sessions list — GET /api/chats
router.get("/chats", getChatSessions);

// Single chat title — GET /api/chat/:chatId/title
router.get("/chat/:chatId/title", getChatTitle);

// Rename chat — PATCH /api/chat/:chatId/title
router.patch("/chat/:chatId/title", updateChatTitle);

// Init chat session (called on page load) — POST /api/chat/:chatId/init
router.post("/chat/:chatId/init", initChat);

// Delete chat — DELETE /api/chat/:chatId
router.delete("/chat/:chatId", deleteChat);

export default router;
