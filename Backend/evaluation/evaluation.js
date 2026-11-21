/**
 * evaluation.js — the viva "AI brain" (OpenAI gpt-4o-mini).
 *
 *   startViva()     → picks topics the student may study, generates questions
 *   submitAnswer()  → grades one answer, moves to the next question
 *   finishViva()    → builds the final report
 *
 * Questions only come from sections the student has FULL access to
 * (same access rules as chat, resolved server-side).
 */
import OpenAI from "openai";
import Topic from "../models/topic.js";
import EvaluationSession from "./evaluationSession.js";
import { resolveChatAccess, tierOfTopic, TIER } from "../services/accessPolicyService.js";
import {
  EXAMINER_SYSTEM,
  generateQuestionsPrompt,
  evaluateAnswerPrompt,
  finalReportPrompt,
} from "./prompts.js";

const MODEL = "gpt-4o-mini";
const MAX_QUESTIONS = 10;
const EXCERPT_CHARS = 1200;

let _openai = null;
const openai = () => (_openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

async function askJSON(userPrompt, temperature = 0.3) {
  const res = await openai().chat.completions.create({
    model: MODEL,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXAMINER_SYSTEM },
      { role: "user", content: userPrompt },
    ],
  });
  return JSON.parse(res.choices[0].message.content || "{}");
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Client-safe view: hides reference answers of unanswered questions. */
export function publicView(session) {
  const s = session.toObject ? session.toObject() : session;
  return {
    sessionId: String(s._id),
    fileId: s.fileId,
    sectionId: s.sectionId,
    assignmentId: s.assignmentId || null,
    difficulty: s.difficulty,
    answerTimeSec: s.answerTimeSec || 90,
    status: s.status,
    currentIndex: s.currentIndex,
    totalQuestions: s.questions.length,
    totalScore: s.totalScore,
    maxScore: s.maxScore,
    currentQuestion:
      s.status === "in_progress" && s.questions[s.currentIndex]
        ? { index: s.currentIndex, topic: s.questions[s.currentIndex].topicTitle, question: s.questions[s.currentIndex].question }
        : null,
    answered: s.questions
      .filter((q) => q.answeredAt)
      .map((q) => ({
        topic: q.topicTitle,
        question: q.question,
        transcript: q.transcript,
        score: q.score,
        verdict: q.verdict,
        feedback: q.feedback,
        missingPoints: q.missingPoints,
        referenceAnswer: q.referenceAnswer,
      })),
    report: s.status === "completed" ? s.report : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export async function startViva({
  userId, userEmail, fileId, sectionId = null, count = 5, difficulty = "medium",
  assignmentId = null, accessUserId = null, // assignment attempts read material with the OWNER's access
  answerTimeSec = 90,
}) {
  const n = Math.min(Math.max(Number(count) || 5, 1), MAX_QUESTIONS);

  const access = await resolveChatAccess({
    fileId,
    userId: accessUserId || userId,
    userEmail: accessUserId ? null : userEmail,
    homeSectionId: sectionId,
  });
  if (!access) throw Object.assign(new Error("File not found"), { status: 404 });

  // Per-section parsing stores outline nodes (title only) + leaf chunks (real text,
  // parentTopicId → outline node). Build one material block per outline topic
  // from its chunks; legacy whole-file topics that carry their own text also count.
  const docs = await Topic.find({ fileId: String(fileId) })
    .select("title summary content level isChunk parentTopicId sectionId pageStart pageEnd")
    .lean();

  const sec = sectionId ? access.byId.get(String(sectionId)) : null;
  if (sectionId && !sec) throw Object.assign(new Error("Section not found"), { status: 404 });
  const inScope = (t) => {
    if (tierOfTopic(t, access) !== TIER.FULL) return false;
    if (!sec) return true;
    if (t.sectionId) return String(t.sectionId) === sec._id;
    return t.pageStart >= sec.pageStart && t.pageEnd <= sec.pageEnd; // legacy topics
  };

  const outlineById = new Map(docs.filter((d) => !d.isChunk).map((d) => [String(d._id), d]));
  const groups = new Map(); // key → { title, level, parts[] }
  for (const d of docs) {
    if (!inScope(d)) continue;
    if (d.isChunk) {
      const parent = d.parentTopicId ? outlineById.get(String(d.parentTopicId)) : null;
      const key = parent ? String(parent._id) : `chunk:${d._id}`;
      if (!groups.has(key)) groups.set(key, { title: parent?.title || d.title, level: parent?.level ?? 0, parts: parent?.summary ? [parent.summary] : [] });
      if (d.content) groups.get(key).parts.push(d.content);
    } else if ((d.content || "").trim() !== (d.title || "").trim() && (d.content || "").length > 80) {
      groups.set(String(d._id), { title: d.title, level: d.level || 0, parts: [d.summary, d.content].filter(Boolean) });
    }
  }

  const allowed = [...groups.values()].filter((g) => g.parts.join(" ").trim().length > 80);
  if (!allowed.length) {
    throw Object.assign(
      new Error(sec ? `No parsed text found in "${sec.title}". Make sure the section has finished parsing.` : "No study material you have full access to was found"),
      { status: 400 }
    );
  }

  // Prefer deeper (more specific) topics, keep ~2x candidates for variety
  const picked = shuffle(allowed)
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, Math.min(allowed.length, n * 2));

  const blocks = picked.map((g, i) => ({
    ref: `T${i + 1}`,
    title: g.title,
    excerpt: g.parts.join("\n").trim().slice(0, EXCERPT_CHARS),
  }));
  const material = blocks.map((b) => `[${b.ref}] ${b.title}\n${b.excerpt}`).join("\n\n");

  const out = await askJSON(generateQuestionsPrompt({ material, count: n, difficulty }), 0.6);
  const byRef = new Map(blocks.map((b) => [b.ref, b]));

  const questions = (out.questions || [])
    .filter((q) => q?.question)
    .slice(0, n)
    .map((q) => {
      const b = byRef.get(q.topicRef) || blocks[0];
      return {
        topicTitle: b.title,
        question: q.question,
        referenceAnswer: q.referenceAnswer || "",
        keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : [],
        sourceExcerpt: b.excerpt,
      };
    });

  if (!questions.length) throw new Error("AI could not generate questions");

  const session = await EvaluationSession.create({
    userId: String(userId),
    fileId: String(fileId),
    sectionId: sectionId ? String(sectionId) : null,
    assignmentId: assignmentId ? String(assignmentId) : null,
    userEmail: userEmail ? String(userEmail).toLowerCase() : "",
    answerTimeSec: Math.min(Math.max(Number(answerTimeSec) || 90, 20), 300),
    difficulty,
    questions,
    maxScore: questions.length * 10,
  });

  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
export async function submitAnswer({ sessionId, userId, transcript }) {
  const session = await EvaluationSession.findOne({ _id: sessionId, userId: String(userId) });
  if (!session) throw Object.assign(new Error("Viva session not found"), { status: 404 });
  if (session.status !== "in_progress") throw Object.assign(new Error("Viva already completed"), { status: 400 });

  const idx = session.currentIndex;
  const q = session.questions[idx];
  const text = String(transcript || "").trim();

  let result;
  if (!text) {
    result = { score: 0, verdict: "incorrect", coveredPoints: [], missingPoints: q.keyPoints, feedback: "I didn't hear an answer. Let's move on." };
  } else {
    result = await askJSON(
      evaluateAnswerPrompt({
        question: q.question,
        referenceAnswer: q.referenceAnswer,
        keyPoints: q.keyPoints,
        material: q.sourceExcerpt,
        transcript: text.slice(0, 4000),
      }),
      0.2
    );
  }

  const score = Math.min(Math.max(Math.round(Number(result.score) || 0), 0), 10);
  Object.assign(q, {
    transcript: text,
    score,
    verdict: result.verdict || (score >= 8 ? "correct" : score >= 4 ? "partial" : "incorrect"),
    coveredPoints: result.coveredPoints || [],
    missingPoints: result.missingPoints || [],
    feedback: result.feedback || "",
    answeredAt: new Date(),
  });

  session.totalScore += score;
  session.currentIndex = idx + 1;
  session.markModified("questions");

  const evaluated = {
    index: idx,
    score,
    verdict: q.verdict,
    feedback: q.feedback,
    missingPoints: q.missingPoints,
    referenceAnswer: q.referenceAnswer,
  };

  if (session.currentIndex >= session.questions.length) {
    await finishViva(session);
  } else {
    await session.save();
  }

  return { evaluated, session };
}

// ─────────────────────────────────────────────────────────────────────────────
export async function finishViva(session) {
  const results = session.questions
    .filter((q) => q.answeredAt)
    .map((q) => ({ topic: q.topicTitle, question: q.question, score: q.score ?? 0, missingPoints: q.missingPoints || [] }));

  let report = { summary: "", strengths: [], weakTopics: [], nextSteps: [] };
  try {
    report = await askJSON(finalReportPrompt({ results, total: session.totalScore, max: session.maxScore }), 0.4);
  } catch (e) {
    console.error("[evaluation] final report failed:", e.message);
    report.summary = `You scored ${session.totalScore} out of ${session.maxScore}.`;
  }

  session.report = report;
  session.status = "completed";
  session.completedAt = new Date();
  await session.save();
  return session;
}
