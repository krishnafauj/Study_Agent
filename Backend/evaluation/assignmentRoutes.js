/**
 * assignmentRoutes.js — viva assignments (mounted under /api, behind verifyToken)
 *
 *   GET    /evaluation/assignments?fileId=        owner: all for file (+ stats) · student: mine
 *   POST   /evaluation/assignments                owner: { fileId, sectionId, title?, emails?, groupIds?, count?, difficulty? }
 *   PATCH  /evaluation/assignments/:id            owner: edit settings / students (applies to new attempts)
 *   DELETE /evaluation/assignments/:id            owner
 *   GET    /evaluation/assignments/:id/results    owner: every attempt with transcripts + scores
 *   POST   /evaluation/assignments/:id/start      student: start an attempt → viva session
 */
import express from "express";
import mongoose from "mongoose";
import UserFile from "../models/userFile.js";
import PermissionSection from "../models/permissionSection.js";
import StudentGroup from "../models/studentGroup.js";
import VivaAssignment from "./vivaAssignment.js";
import EvaluationSession from "./evaluationSession.js";
import { startViva, publicView } from "./evaluation.js";

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isId = (id) => mongoose.isValidObjectId(id);
const me = (req) => ({ userId: String(req.user.userId), email: String(req.user?.email || "").toLowerCase() });

const fail = (res, err, fallback) => {
  console.error("[assignments]", err.message);
  res.status(err.status || 500).json({ success: false, message: err.status ? err.message : fallback });
};

const clampCount = (c) => Math.min(Math.max(Number(c) || 5, 1), 10);
const clampTime = (t) => Math.min(Math.max(Number(t) || 90, 20), 300);
const cleanDifficulty = (d) => (["easy", "medium", "hard"].includes(d) ? d : "medium");

/** emails (array or "a, b; c") + owner's groups → unique lowercase email list */
async function collectStudents(emails, groupIds, ownerId) {
  const set = new Set(
    (Array.isArray(emails) ? emails : String(emails || "").split(/[\s,;]+/))
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e))
  );
  const validGroupIds = (Array.isArray(groupIds) ? groupIds : []).filter(isId);
  if (validGroupIds.length) {
    const groups = await StudentGroup.find({ _id: { $in: validGroupIds }, ownerId }).select("members").lean();
    groups.forEach((g) => g.members.forEach((m) => m.email && set.add(m.email.toLowerCase())));
  }
  return { emails: [...set], groupIds: validGroupIds };
}

async function sectionTitleOf(fileId, sectionId) {
  if (!sectionId) return "";
  if (!isId(sectionId)) throw Object.assign(new Error("Invalid sectionId"), { status: 400 });
  const sec = await PermissionSection.findOne({ _id: sectionId, fileId: String(fileId) }).select("title").lean();
  if (!sec) throw Object.assign(new Error("Section not found"), { status: 404 });
  return sec.title || "";
}

async function ownsFile(fileId, userId) {
  if (!isId(fileId)) return false;
  const f = await UserFile.findById(fileId).select("userId").lean();
  return !!f && String(f.userId) === String(userId);
}

// ── List ─────────────────────────────────────────────────────────────────────
router.get("/evaluation/assignments", async (req, res) => {
  try {
    const { userId, email } = me(req);
    const { fileId } = req.query;
    if (!fileId) return res.status(400).json({ success: false, message: "fileId required" });

    const isOwner = await ownsFile(fileId, userId);
    const filter = isOwner ? { fileId: String(fileId) } : { fileId: String(fileId), studentEmails: email };
    const list = await VivaAssignment.find(filter).sort({ createdAt: -1 }).lean();
    const ids = list.map((a) => String(a._id));

    // attempt stats: owner → across all students, student → own attempts
    const match = { assignmentId: { $in: ids }, ...(isOwner ? {} : { userId }) };
    const stats = await EvaluationSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$assignmentId",
          attempts: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          students: { $addToSet: "$userId" },
          bestScore: { $max: { $cond: [{ $eq: ["$status", "completed"] }, "$totalScore", null] } },
          maxScore: { $max: "$maxScore" },
          lastSessionId: { $last: "$_id" },
          lastStatus: { $last: "$status" },
        },
      },
    ]);
    const byId = new Map(stats.map((s) => [s._id, s]));

    const assignments = list.map((a) => {
      const s = byId.get(String(a._id));
      return {
        _id: String(a._id),
        title: a.title,
        sectionId: a.sectionId,
        sectionTitle: a.sectionTitle,
        count: a.count,
        difficulty: a.difficulty,
        answerTimeSec: a.answerTimeSec || 90,
        createdAt: a.createdAt,
        studentCount: isOwner ? a.studentEmails.length : undefined,
        studentEmails: isOwner ? a.studentEmails : undefined,
        stats: {
          attempts: s?.attempts || 0,
          completed: s?.completed || 0,
          studentsAttempted: s?.students?.length || 0,
          bestScore: s?.bestScore ?? null,
          maxScore: s?.maxScore ?? a.count * 10,
          inProgressSessionId: s?.lastStatus === "in_progress" ? String(s.lastSessionId) : null,
        },
      };
    });

    res.json({ success: true, isOwner, assignments });
  } catch (err) {
    fail(res, err, "Could not load assignments");
  }
});

// ── Create ───────────────────────────────────────────────────────────────────
router.post("/evaluation/assignments", async (req, res) => {
  try {
    const { userId } = me(req);
    const { fileId, sectionId, title, emails = [], groupIds = [], count, difficulty, answerTimeSec } = req.body || {};
    if (!(await ownsFile(fileId, userId))) return res.status(403).json({ success: false, message: "Only the owner can assign" });

    const sectionTitle = await sectionTitleOf(fileId, sectionId);
    const students = await collectStudents(emails, groupIds, userId);
    if (!students.emails.length) return res.status(400).json({ success: false, message: "Add at least one student or group" });

    const a = await VivaAssignment.create({
      ownerId: userId,
      fileId: String(fileId),
      sectionId: sectionId || null,
      sectionTitle,
      title: String(title || "").trim() || `Viva: ${sectionTitle || "Whole book"}`,
      count: clampCount(count),
      difficulty: cleanDifficulty(difficulty),
      answerTimeSec: clampTime(answerTimeSec),
      groupIds: students.groupIds,
      studentEmails: students.emails,
    });

    res.json({ success: true, assignment: { _id: String(a._id), title: a.title, studentCount: students.emails.length } });
  } catch (err) {
    fail(res, err, "Could not create assignment");
  }
});

// ── Edit ─────────────────────────────────────────────────────────────────────
router.patch("/evaluation/assignments/:id", async (req, res) => {
  try {
    const { userId } = me(req);
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const a = await VivaAssignment.findOne({ _id: req.params.id, ownerId: userId });
    if (!a) return res.status(404).json({ success: false, message: "Assignment not found" });

    const b = req.body || {};
    if (b.title !== undefined) a.title = String(b.title).trim() || a.title;
    if (b.count !== undefined) a.count = clampCount(b.count);
    if (b.difficulty !== undefined) a.difficulty = cleanDifficulty(b.difficulty);
    if (b.answerTimeSec !== undefined) a.answerTimeSec = clampTime(b.answerTimeSec);
    if (b.sectionId !== undefined) {
      a.sectionTitle = await sectionTitleOf(a.fileId, b.sectionId);
      a.sectionId = b.sectionId || null;
    }
    if (b.emails !== undefined || b.groupIds !== undefined) {
      const students = await collectStudents(b.emails ?? [], b.groupIds ?? [], userId);
      if (!students.emails.length) return res.status(400).json({ success: false, message: "Add at least one student or group" });
      a.studentEmails = students.emails;
      a.groupIds = students.groupIds;
    }
    await a.save();
    res.json({ success: true });
  } catch (err) {
    fail(res, err, "Could not update assignment");
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete("/evaluation/assignments/:id", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const r = await VivaAssignment.deleteOne({ _id: req.params.id, ownerId: me(req).userId });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: "Assignment not found" });
    res.json({ success: true });
  } catch (err) {
    fail(res, err, "Could not delete assignment");
  }
});

// ── Owner review ─────────────────────────────────────────────────────────────
router.get("/evaluation/assignments/:id/results", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const a = await VivaAssignment.findOne({ _id: req.params.id, ownerId: me(req).userId }).lean();
    if (!a) return res.status(404).json({ success: false, message: "Assignment not found" });

    const sessions = await EvaluationSession.find({ assignmentId: String(a._id) }).sort({ createdAt: -1 }).lean();
    const attempts = sessions.map((s) => ({
      sessionId: String(s._id),
      userEmail: s.userEmail,
      status: s.status,
      totalScore: s.totalScore,
      maxScore: s.maxScore,
      fullscreenExits: s.fullscreenExits || 0,
      tabSwitches: s.tabSwitches || 0,
      startedAt: s.createdAt,
      completedAt: s.completedAt,
      report: s.report || null,
      questions: s.questions.map((q) => ({
        topic: q.topicTitle,
        question: q.question,
        referenceAnswer: q.referenceAnswer,
        transcript: q.transcript,
        score: q.score,
        verdict: q.verdict,
        feedback: q.feedback,
        missingPoints: q.missingPoints,
      })),
    }));

    const attempted = new Set(sessions.map((s) => s.userEmail));
    res.json({
      success: true,
      assignment: {
        _id: String(a._id), title: a.title, sectionTitle: a.sectionTitle, count: a.count,
        difficulty: a.difficulty, answerTimeSec: a.answerTimeSec || 90, fileId: a.fileId, studentEmails: a.studentEmails,
      },
      notStarted: a.studentEmails.filter((e) => !attempted.has(e)),
      attempts,
    });
  } catch (err) {
    fail(res, err, "Could not load results");
  }
});

// ── Student starts an attempt ────────────────────────────────────────────────
router.post("/evaluation/assignments/:id/start", async (req, res) => {
  try {
    const { userId, email } = me(req);
    if (!isId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
    const a = await VivaAssignment.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ success: false, message: "Assignment not found" });

    const isOwner = a.ownerId === userId; // owner may test-run their own assignment
    if (!isOwner && !a.studentEmails.includes(email)) {
      return res.status(403).json({ success: false, message: "This viva is not assigned to you" });
    }

    // resume an unfinished attempt instead of creating a new one
    const open = await EvaluationSession.findOne({ assignmentId: String(a._id), userId, status: "in_progress" });
    if (open) return res.json({ success: true, resumed: true, session: publicView(open) });

    const session = await startViva({
      userId,
      userEmail: email,
      fileId: a.fileId,
      sectionId: a.sectionId,
      count: a.count,
      difficulty: a.difficulty,
      answerTimeSec: a.answerTimeSec || 90,
      assignmentId: String(a._id),
      accessUserId: a.ownerId,
    });
    res.json({ success: true, resumed: false, session: publicView(session) });
  } catch (err) {
    fail(res, err, "Could not start viva");
  }
});

export default router;
