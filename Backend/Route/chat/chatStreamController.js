import { model } from "./chatbotGraph.js";
import ChatMessage from "../../models/chatMessage.js";
import ChatSession from "../../models/chatSession.js";
import ChatContext from "../../models/ChatContextSchema.js";
import Folder from "../../models/FolderSchema.js";
import Topic from "../../models/topic.js";

import {
  HumanMessage,
  AIMessage,
  SystemMessage
} from "@langchain/core/messages";

import {
  getFolderContext,
  getWeakTopics,
  getStructuredContext
} from "../../services/studyContextService.js";

import { lfConfig } from "../../services/langfuse.js";
import { resolveChatAccess, TIER } from "../../services/accessPolicyService.js";
import { getTieredContext, getSectionOutlines } from "../../services/tieredRetrievalService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Build the system prompt with PROGRESSIVE access (see accessPolicyService.js)
//
//   FULL   (assign)  → teach in depth
//   BRIEF  (see)     → definitions / outline only
//   LOCKED (none)    → definition-level only, when needed or asked — never a
//                      flat refusal, never page text
//   HOME   (chat's own section) → ranked first; "in my home I am king"
//
// The owner of a file with no permission sections keeps the original
// whole-file behaviour.
// ─────────────────────────────────────────────────────────────────────────────

async function buildOwnerOverview(fileId, { includeOutline }) {
  let topicsBlock = "";
  let weakBlock = "";
  const ctx = await getFolderContext(fileId);
  if (ctx && ctx.topics.length > 0) {
    if (includeOutline) {
      const topicLines = ctx.topics
        .filter((t) => t.level === 0)
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join("\n");
      if (topicLines) topicsBlock = `\n## Topics in Student's Study Material (${ctx.fileName})\n${topicLines}\n`;
    }
    const attempted = ctx.topics.filter((t) => t.performanceScore !== null && t.performanceScore !== undefined);
    if (attempted.length > 0) {
      const perfLines = attempted.map((t) => `  - ${t.title}: ${Number(t.performanceScore).toFixed(1)}%`).join("\n");
      topicsBlock += `\n## Student's Performance\n${perfLines}\n`;
    }
  }
  const { weakTopics, source } = await getWeakTopics(fileId, 70);
  if (weakTopics.length > 0) {
    const weakLines = weakTopics.slice(0, 10).map((t) => {
      const score = t.performanceScore !== null && t.performanceScore !== undefined
        ? `${Number(t.performanceScore).toFixed(1)}%`
        : "not attempted yet";
      return `  - ${t.topicName} (${score})`;
    }).join("\n");
    weakBlock = source === "not_attempted"
      ? `\n## Topics the Student Has Not Studied Yet\n${weakLines}\n`
      : `\n## Topics Needing Attention (Under 70%)\n${weakLines}\n`;
  }
  return { topicsBlock, weakBlock };
}

function renderChunks(chunks) {
  return chunks
    .map((c, i) => {
      const tags = [c.isHome ? "HOME" : "", c.sectionTitle, c.number, c.contentType, c.pageStart ? `p.${c.pageStart}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `[Source ${i + 1}${tags ? " · " + tags : ""}] ${c.title}\n${c.content || ""}`;
    })
    .join("\n\n");
}

async function buildSystemPrompt({ message, fileId, access, conversationSummary }) {
  const header = [
    "You are a personalized AI study assistant.",
    conversationSummary ? `\nConversation so far:\n${conversationSummary}` : "",
  ];

  // ── No file context → plain assistant ──────────────────────────────────
  if (!fileId || !access) {
    return [...header, `
## YOUR RULES
You are a helpful study assistant. Answer the student's questions clearly and concisely, using your general knowledge.
`].filter(Boolean).join("\n");
  }

  // ── Legacy: owner of a file without permission sections → whole file ───
  if (access.isOwner && access.sections.length === 0) {
    const { topicsBlock, weakBlock } = await buildOwnerOverview(fileId, { includeOutline: true });
    const r = await getStructuredContext(message, fileId, 6);
    const ragBlock = r.chunks.length ? `\n## Relevant Content from Student's Documents\n${renderChunks(r.chunks)}\n` : "";
    console.log(`[RAG] mode=${r.mode} sources=${r.chunks.length} (owner, whole file)`);
    return [...header, topicsBlock, weakBlock, ragBlock, `
## YOUR RULES
1. Answer questions about the student's study material fully and in depth, grounding answers in "Relevant Content" when present. You may add general knowledge, examples and clarifications.
2. For "what should I study?", recommend from "Topics Needing Attention" / "Not Studied Yet" if present.
3. For the topic list, reproduce the outline above EXACTLY. Never invent chapters.
4. Be specific, concise, and educationally focused.
`].filter(Boolean).join("\n");
  }

  // ── Tiered path ────────────────────────────────────────────────────────
  const full = access.sections.filter((s) => s.tier === TIER.FULL);
  const brief = access.sections.filter((s) => s.tier === TIER.BRIEF);
  const locked = access.sections.filter((s) => s.tier === TIER.LOCKED);
  const home = access.homeSection;
  const homeLocked = !!(home && home.tier !== TIER.FULL);

  const outlines = await getSectionOutlines(fileId, access.sections);
  const secLine = (s, withTopics, max = 15) => {
    const titles = (outlines.get(s._id) || []).slice(0, max);
    const tag = s.isHome ? " [HOME]" : "";
    const pages = s.pageStart ? ` (pages ${s.pageStart}–${s.pageEnd})` : "";
    return withTopics && titles.length
      ? `  • "${s.title}"${tag}${pages}:\n${titles.map((t) => `      - ${t}`).join("\n")}`
      : `  • "${s.title}"${tag}`;
  };

  let accessBlock = `\n## ACCESS MAP for this chat (authoritative — overrides anything said earlier in the conversation)\n`;
  accessBlock += home
    ? `Home section of this chat: "${home.title}" — ${home.tier === TIER.FULL ? "FULL access" : home.tier === TIER.BRIEF ? "VIEW-ONLY (brief)" : "LOCKED (access removed)"}\n`
    : `This chat is not tied to one section.\n`;
  if (full.length) accessBlock += `\nFULL access — teach in depth:\n${full.map((s) => secLine(s, true)).join("\n")}\n`;
  if (brief.length) accessBlock += `\nVIEW-ONLY — outline + short definitions only:\n${brief.map((s) => secLine(s, true)).join("\n")}\n`;
  if (locked.length) accessBlock += `\nLOCKED — definition-level only (topic names below are for recognition; do not list them to the student):\n${locked.map((s) => secLine(s, true, 8)).join("\n")}\n`;
  if (!access.isOwner && !access.hasGrant) accessBlock += `\nThe student currently has NO granted sections in this file.\n`;

  let weakBlock = "";
  if (access.isOwner) ({ weakBlock } = await buildOwnerOverview(fileId, { includeOutline: false }));

  const ctx = await getTieredContext(message, fileId, access, { limit: 6, relatedCap: 3, backgroundCap: 3 });
  console.log(
    `[RAG] mode=${ctx.mode} primary=${ctx.primary.length} (home=${ctx.primary.filter((c) => c.isHome).length}) related=${ctx.related.length} background=${ctx.background.length} | home=${home ? `${home.title}:${home.tier}` : "none"}`
  );

  const ragBlock = ctx.primary.length
    ? `\n## Relevant Content (FULL access — ground your answer here; [HOME] = this chat's own section)\n${renderChunks(ctx.primary)}\n`
    : "";
  const relatedBlock = ctx.related.length
    ? `\n## Connected Topics the Student Can Also Access (knowledge graph)\n${ctx.related.map((r) => `- ${r.title} (in "${r.sectionTitle}"): ${r.summary}`).join("\n")}\n`
    : "";
  const backgroundBlock = ctx.background.length
    ? `\n## Brief Background — RESTRICTED concepts (definition level ONLY, never expand)\n${ctx.background
        .map((b) => `- ${b.title} (in "${b.sectionTitle}", ${b.tier === TIER.BRIEF ? "view-only" : "locked"}${b.reason === "prerequisite" ? ", prerequisite of the current topic" : ", asked by student"}): ${b.definition}`)
        .join("\n")}\n`
    : "";

  const rules = [
    `\n## YOUR RULES`,
    home && home.tier === TIER.FULL
      ? `1. HOME FIRST: this chat belongs to "${home.title}". For vague or general requests ("explain this", "what are the topics", "give me practice questions"), answer from the home section first.`
      : `1. Prefer FULL-access content when a request is vague.`,
    `2. FULL ACCESS: anything inside a FULL-access section may be taught completely — explanations, examples, code, full solutions — even when it is not the home section. Never refuse or water down FULL-access topics.`,
    `3. PROGRESSIVE RESTRICTION for VIEW-ONLY and LOCKED topics: do NOT refuse flatly and do NOT reply only "this topic is restricted". Give a minimal answer instead: a 1–3 sentence definition or intuition, plus (if relevant) one line on how it connects to what the student is studying. Do NOT give step-by-step explanations, worked examples, code, full problem solutions, or long follow-ups on it. End with one short line such as: "<topic> is covered in <section>, which isn't in your full access — ask your instructor if you need the full walkthrough." VIEW-ONLY topics may additionally have their subtopic outline listed.`,
    `4. PREREQUISITES: when a FULL topic depends on a restricted concept listed under "Brief Background", weave in its short definition so the answer makes sense, then continue teaching the FULL topic in depth.`,
    homeLocked
      ? `5. HOME IS NOT FULLY ACCESSIBLE: the student's access to this chat's section "${home.title}" is ${home.tier === TIER.BRIEF ? "view-only" : "removed"}. If asked whether it is available, say so plainly. Teach it only as rule 3 allows and suggest continuing with a FULL-access section${full.length ? ` (${full.map((s) => `"${s.title}"`).join(", ")})` : ""}.`
      : `5. If the student asks what they can study here, name the FULL-access sections (and VIEW-ONLY ones as overview-only).`,
    `6. GENERAL KNOWLEDGE: general study questions not covered by any section of this book may be answered normally — unless the question is clearly about a VIEW-ONLY or LOCKED topic, in which case rule 3 applies.`,
    `7. Topic-list requests: reproduce FULL and VIEW-ONLY titles exactly as listed above. Never invent chapters. For LOCKED sections mention only the section name.`,
    `8. The ACCESS MAP is current. If earlier messages went deeper into something that is now VIEW-ONLY or LOCKED, do not continue or repeat that depth.`,
    `9. Be specific, concise, and educationally focused.`,
  ].join("\n");

  return [...header, accessBlock, weakBlock, ragBlock, relatedBlock, backgroundBlock, rules]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER: POST /api/chat-stream
// Body: { message, chatId, fileId?, folderId? }
// ─────────────────────────────────────────────────────────────────────────────
export const chatStreamHandler = async (req, res) => {

  try {

    const {
      message,
      chatId,
      fileId: bodyFileId,
      folderId: bodyFolderId,
      sectionId: bodySectionId,
    } = req.body;
    const userId = req.user.userId;

    console.log("------ New Streaming Chat ------");
    console.log(`chatId: ${chatId} | fileId: ${bodyFileId} | folderId: ${bodyFolderId} | sectionId: ${bodySectionId}`);

    // ─── Resolve fileId + sectionId (body → ChatSession fallback) ─────────
    let fileId = bodyFileId || null;
    let folderId = bodyFolderId || null;
    let sectionId = bodySectionId || null;

    if (!fileId && !folderId || !sectionId) {
      const session = await ChatSession.findOne({ chatId, userId })
        .select("fileId folderId sectionId")
        .lean();
      if (session) {
        fileId = fileId || session.fileId || null;
        folderId = folderId || session.folderId || null;
        sectionId = sectionId || session.sectionId || null;
        if (fileId || folderId) {
          console.log(`📎 Context from ChatSession — fileId: ${fileId} | folderId: ${folderId} | sectionId: ${sectionId}`);
        }
      }
    }

    // fileId is the primary key; treat folderId as fileId fallback
    const contextFileId = fileId || folderId || null;

    // ─── Load / create ChatContext ────────────────────────────────────────
    let context = await ChatContext.findOne({ chatId });

    if (!context) {
      context = await ChatContext.create({
        chatId,
        userId,
        fileId: contextFileId,
        folderId: folderId || null,
        summary: "",
        recentMessages: [],
      });
    } else if (!context.fileId && contextFileId) {
      await ChatContext.updateOne(
        { chatId },
        { $set: { fileId: contextFileId, folderId: folderId || null } }
      );
      context.fileId = contextFileId;
    }

    // ─── Build topic-scoped system prompt ────────────────────────────────
    const resolvedFileId = contextFileId || context.fileId || null;

    // ─── Resolve progressive access (server-side, from the grant) ────────
    const access = resolvedFileId
      ? await resolveChatAccess({
          fileId: resolvedFileId,
          userId,
          userEmail: req.user?.email,
          homeSectionId: sectionId, // this chat's HOME section
        })
      : null;

    // If permissions changed since this chat's memory was written (or this is
    // an old chat whose home section is now restricted), start memory fresh so
    // earlier full-depth answers can't leak back in.
    const homeRestricted = !!(access?.homeSection && access.homeSection.tier !== TIER.FULL);
    const accessChanged = !!access && (
      (context.accessSig && context.accessSig !== access.signature) ||
      (!context.accessSig && homeRestricted)
    );
    let history = context.recentMessages || [];
    let memorySummary = context.summary || "";
    if (accessChanged) {
      console.log(`🔐 [Access] permissions changed for chat ${chatId} → resetting chat memory`);
      history = [];
      memorySummary = "";
    }

    const systemPromptText = await buildSystemPrompt({
      message,
      fileId: resolvedFileId,
      access,
      conversationSummary: memorySummary,
    });

    console.log(`🧠 System prompt built (${systemPromptText.length} chars) | Has context: ${resolvedFileId ? "YES — " + resolvedFileId : "NO"}`);

    // ─── Build LangChain messages ─────────────────────────────────────────
    const messages = [new SystemMessage(systemPromptText)];

    for (const msg of history) {
      messages.push(
        msg.role === "user"
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      );
    }
    messages.push(new HumanMessage(message));

    // Langfuse: group every LLM call in this request under one chat session.
    const lf = lfConfig({ userId, sessionId: chatId });

    // ─── SSE headers ──────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // ─── Generate Title Asynchronously (if first message) ─────────────────
    const isFirstMessage = context.recentMessages.length === 0;
    let titlePromise = null;
    if (isFirstMessage) {
      titlePromise = model.invoke([
        new SystemMessage("You are a helpful assistant. Provide a short, relevant title (3 to 5 words) for a chat that starts with the following message. Respond ONLY with the title text."),
        new HumanMessage(message)
      ], { ...lf, runName: "chat_title" }).then(res => {
        const title = res.content.trim().replace(/^["']|["']$/g, "");
        return title;
      }).catch(err => {
        console.error("Failed to generate title:", err);
        return null;
      });
    }

    // ─── Stream LLM response ──────────────────────────────────────────────
    const stream = await model.stream(messages, { ...lf, runName: "chat_reply" });
    let assistantText = "";

    for await (const chunk of stream) {
      const token = chunk.content || "";
      assistantText += token;
      // JSON-encode so embedded newlines/special chars don't break SSE format
      res.write(`data: ${JSON.stringify({ text: token })}\n\n`);
    }

    // ─── Send Title if generated ──────────────────────────────────────────
    let finalTitle = null;
    if (titlePromise) {
      finalTitle = await titlePromise;
      if (finalTitle) {
        res.write(`data: ${JSON.stringify({ title: finalTitle })}\n\n`);
      }
    }

    // ─── Save messages ────────────────────────────────────────────────────
    await ChatMessage.insertMany([
      { chatId, userId, role: "user", content: message },
      { chatId, userId, role: "assistant", content: assistantText },
    ]);

    // ─── Score Detection ──────────────────────────────────────────────────
    // Only attempt scoring when there's a file context (topic-based chat)
    if (resolvedFileId) {
      try {
        const scoreDetectionPrompt = `You are evaluating a student's understanding based on a Q&A exchange.

User message: "${message}"
AI response: "${assistantText.slice(0, 800)}"

Did this exchange involve the student demonstrating, answering, or being evaluated on knowledge of a specific topic?

If YES, extract the topic name (use the exact topic name from the study material if possible) and assign a score from 0-10 based on:
- 0-3: No understanding shown or wrong answers
- 4-6: Partial understanding
- 7-8: Good understanding  
- 9-10: Excellent understanding

Return ONLY valid JSON:
{"hasScore": true, "topicName": "exact topic name", "score": 7, "reason": "brief reason"}

If NO knowledge exchange happened (e.g. just asking for explanation, general questions), return:
{"hasScore": false}`;

        const scoreResult = await model.invoke([
          new SystemMessage("You are a strict educational evaluator. Return ONLY valid JSON, no markdown."),
          new HumanMessage(scoreDetectionPrompt)
        ], { ...lf, runName: "score_detection" });

        let scoreData = null;
        try {
          const raw = scoreResult.content.trim().replace(/```json|```/g, "").trim();
          scoreData = JSON.parse(raw);
        } catch (e) {
          console.log("[Score] Could not parse score JSON:", scoreResult.content);
        }

        if (scoreData?.hasScore && scoreData.topicName && typeof scoreData.score === "number") {
          const score = Math.min(10, Math.max(0, scoreData.score));
          const performanceScore = (score / 10) * 100;
          const weakFlag = performanceScore < 70;

          // Find topic in DB to get topicId
          const topicDoc = await Topic.findOne({
            fileId: resolvedFileId,
            title: { $regex: scoreData.topicName.trim(), $options: "i" }
          }).select("_id title").lean();

          const topicName = topicDoc?.title || scoreData.topicName;
          const topicId = topicDoc?._id?.toString() || null;

          // Upsert the score into FolderSchema
          const folder = await Folder.findOneAndUpdate(
            { fileId: resolvedFileId },
            { $setOnInsert: { userId, fileId: resolvedFileId } },
            { upsert: true, new: true }
          );

          const existingTopicIdx = folder.topics.findIndex(
            (t) => t.topicName?.toLowerCase() === topicName.toLowerCase()
          );

          const newMark = { score, total: 10, attemptedAt: new Date() };

          if (existingTopicIdx >= 0) {
            // Add mark to existing topic
            folder.topics[existingTopicIdx].marks.push(newMark);
            const allMarks = folder.topics[existingTopicIdx].marks;
            const avg = allMarks.reduce((s, m) => s + (m.score / m.total) * 100, 0) / allMarks.length;
            folder.topics[existingTopicIdx].performanceScore = Math.round(avg * 10) / 10;
            folder.topics[existingTopicIdx].weakFlag = avg < 70;
          } else {
            // Add new topic entry
            folder.topics.push({
              topicId,
              topicName,
              marks: [newMark],
              performanceScore,
              weakFlag
            });
          }

          await folder.save();

          // Emit scoreUpdate SSE event to frontend
          const updatedTopic = existingTopicIdx >= 0 ? folder.topics[existingTopicIdx] : folder.topics[folder.topics.length - 1];
          res.write(`data: ${JSON.stringify({
            scoreUpdate: {
              topicName,
              score,
              total: 10,
              performanceScore: updatedTopic.performanceScore,
              weakFlag: updatedTopic.weakFlag,
              reason: scoreData.reason
            }
          })}\n\n`);

          console.log(`📊 [Score] Saved: "${topicName}" → ${score}/10 (${performanceScore.toFixed(1)}%) | weak: ${weakFlag}`);
        }
      } catch (scoreErr) {
        console.error("[Score] Detection failed:", scoreErr.message);
        // Non-fatal — don't break the stream
      }
    }

    // ─── Update ChatSession ─────
    const updatePayload = {
      $setOnInsert: {
        ...(contextFileId && { fileId: contextFileId }),
        ...(folderId && { folderId }),
        ...(sectionId && { sectionId }),
      }
    };
    if (finalTitle) {
      updatePayload.$set = { title: finalTitle };
    } else if (isFirstMessage) {
      updatePayload.$setOnInsert.title = message.trim().slice(0, 60);
    }

    await ChatSession.findOneAndUpdate(
      { chatId, userId },
      updatePayload,
      { upsert: true, new: true }
    );

    // ─── Update conversation memory ───────────────────────────────────────
    const updatedMessages = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: assistantText },
    ].slice(-8);

    // Generate rolling summary
    const summaryResult = await model.invoke([
      new SystemMessage("Summarize conversations in 2 concise sentences. Focus on topics discussed and key points made."),
      new HumanMessage(
        `Previous summary:\n${memorySummary || "(none)"}\n\nRecent messages:\n${updatedMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nUpdated summary:`
      ),
    ], { ...lf, runName: "chat_summary" });

    // ─── Save updated context ─────────────────────────────────────────────
    await ChatContext.updateOne(
      { chatId },
      {
        $set: {
          summary: summaryResult.content,
          recentMessages: updatedMessages,
          accessSig: access?.signature ?? null,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // ─── Done ──────────────────────────────────────────────────────
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error("Streaming error:", error);
    res.write(`data: ERROR\n\n`);
    res.end();
  }
};