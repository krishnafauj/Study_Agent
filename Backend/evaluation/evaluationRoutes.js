/**
 * evaluationRoutes.js — viva endpoints (mounted under /api, behind verifyToken)
 *
 *   POST /evaluation/start                       { fileId, sectionId?, count?, difficulty? }
 *   GET  /evaluation/:sessionId                  current state / final report
 *   GET  /evaluation/:sessionId/question/audio   current question as mp3 (TTS)
 *   POST /evaluation/:sessionId/answer           multipart "audio" file  OR  JSON { transcript }
 *   POST /evaluation/:sessionId/finish           end early, get report
 *   GET  /evaluation                             my past vivas
 *
 *   POST /evaluation/stt                          multipart "audio" → { transcript }
 *   POST /evaluation/tts                          { text, voice? } → mp3
 */
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import EvaluationSession from "./evaluationSession.js";
import { speechToText } from "./speechToText.js";
import { textToSpeech } from "./textToSpeech.js";
import { startViva, submitAnswer, finishViva, publicView } from "./evaluation.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // ~15 MB of audio
  fileFilter: (_req, file, cb) => cb(null, /^audio\/|^video\/webm/.test(file.mimetype)),
});

const fail = (res, err, fallback) => {
  console.error("[evaluation]", err.message);
  res.status(err.status || 500).json({ success: false, message: err.status ? err.message : fallback });
};

const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.sessionId)
    ? next()
    : res.status(400).json({ success: false, message: "Invalid session id" });

const sendMp3 = (res, buf) => {
  res.set({ "Content-Type": "audio/mpeg", "Content-Length": buf.length, "Cache-Control": "no-store" });
  res.send(buf);
};

// ── Standalone STT / TTS ─────────────────────────────────────────────────────
router.post("/evaluation/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "audio file required" });
    const out = await speechToText(req.file.buffer, req.file.mimetype);
    res.json({ success: true, ...out });
  } catch (err) {
    fail(res, err, "Speech to text failed");
  }
});

router.post("/evaluation/tts", async (req, res) => {
  try {
    const { text, voice } = req.body || {};
    if (!text) return res.status(400).json({ success: false, message: "text required" });
    sendMp3(res, await textToSpeech(text, voice));
  } catch (err) {
    fail(res, err, "Text to speech failed");
  }
});

// ── Viva flow ────────────────────────────────────────────────────────────────
router.post("/evaluation/start", async (req, res) => {
  try {
    const { fileId, sectionId, count, difficulty } = req.body || {};
    if (!fileId) return res.status(400).json({ success: false, message: "fileId required" });
    const session = await startViva({
      userId: req.user.userId,
      userEmail: req.user?.email,
      fileId,
      sectionId,
      count,
      difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
    });
    res.json({ success: true, session: publicView(session) });
  } catch (err) {
    fail(res, err, "Could not start viva");
  }
});

router.get("/evaluation", async (req, res) => {
  try {
    const list = await EvaluationSession.find({ userId: String(req.user.userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("fileId sectionId difficulty status totalScore maxScore createdAt completedAt")
      .lean();
    res.json({ success: true, sessions: list });
  } catch (err) {
    fail(res, err, "Could not load vivas");
  }
});

router.get("/evaluation/:sessionId", validId, async (req, res) => {
  try {
    const session = await EvaluationSession.findOne({ _id: req.params.sessionId, userId: String(req.user.userId) });
    if (!session) return res.status(404).json({ success: false, message: "Viva session not found" });
    res.json({ success: true, session: publicView(session) });
  } catch (err) {
    fail(res, err, "Could not load viva");
  }
});

router.get("/evaluation/:sessionId/question/audio", validId, async (req, res) => {
  try {
    const session = await EvaluationSession.findOne({ _id: req.params.sessionId, userId: String(req.user.userId) })
      .select("questions currentIndex status")
      .lean();
    if (!session) return res.status(404).json({ success: false, message: "Viva session not found" });
    const q = session.questions[session.currentIndex];
    if (session.status !== "in_progress" || !q) return res.status(400).json({ success: false, message: "No current question" });
    sendMp3(res, await textToSpeech(q.question));
  } catch (err) {
    fail(res, err, "Could not generate question audio");
  }
});

router.post("/evaluation/:sessionId/answer", validId, upload.single("audio"), async (req, res) => {
  try {
    let transcript = req.body?.transcript || "";
    let stt = null;
    if (req.file) {
      stt = await speechToText(req.file.buffer, req.file.mimetype);
      transcript = stt.transcript;
    }
    const { evaluated, session } = await submitAnswer({
      sessionId: req.params.sessionId,
      userId: req.user.userId,
      transcript,
    });
    res.json({ success: true, transcript, sttConfidence: stt?.confidence ?? null, evaluated, session: publicView(session) });
  } catch (err) {
    fail(res, err, "Could not evaluate answer");
  }
});

router.post("/evaluation/:sessionId/finish", validId, async (req, res) => {
  try {
    const session = await EvaluationSession.findOne({ _id: req.params.sessionId, userId: String(req.user.userId) });
    if (!session) return res.status(404).json({ success: false, message: "Viva session not found" });
    if (session.status === "in_progress") await finishViva(session);
    res.json({ success: true, session: publicView(session) });
  } catch (err) {
    fail(res, err, "Could not finish viva");
  }
});

export default router;
