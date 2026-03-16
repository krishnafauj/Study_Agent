import express from "express";
const router = express.Router();
import { chatHandler } from "./chat/chatController.js";
import { chatStreamHandler } from "./chat/chatStreamController.js";

import authRoutes from "./Auth/auth.js";
import { verifyToken } from "../middleware/authMiddleware.js";
console.log("Route loaded");    
router.use("/auth", authRoutes);

console.log('auth calling')
router.use(verifyToken);
router.post("/chat-stream", chatStreamHandler);

export default router;
