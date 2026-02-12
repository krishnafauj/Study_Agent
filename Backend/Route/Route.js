import express from "express";
const router = express.Router();

import authRoutes from "./Auth/auth.js";
import { verifyToken } from "../middleware/authMiddleware.js";
console.log("Route loaded");    
router.use("/auth", authRoutes);
router.use(verifyToken);

router.get("/hello", (req, res) => {
    res.send("Hello from route.js");
});

export default router;
