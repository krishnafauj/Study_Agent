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
  getRagContext
} from "../../services/studyContextService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Build topic-scoped system prompt from direct DB queries
// ─────────────────────────────────────────────────────────────────────────────
async function buildSystemPrompt({ message, fileId, conversationSummary }) {

  let topicsBlock = "";
  let weakBlock = "";
  let ragBlock = "";

  if (fileId) {

    // 1. Folder context — all topics + marks
    const ctx = await getFolderContext(fileId);

    if (ctx && ctx.topics.length > 0) {
      const topicLines = ctx.topics
        .filter((t) => t.level === 0) // only top-level topics for scoping
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join("\n");

      if (topicLines) {
        topicsBlock = `\n## Topics in Student's Study Material (${ctx.fileName})\n${topicLines}\n`;
      }

      // Performance marks (if any exist)
      const attempted = ctx.topics.filter(
        (t) => t.performanceScore !== null && t.performanceScore !== undefined
      );
      if (attempted.length > 0) {
        const perfLines = attempted
          .map((t) => `  - ${t.title}: ${Number(t.performanceScore).toFixed(1)}%`)
          .join("\n");
        topicsBlock += `\n## Student's Performance\n${perfLines}\n`;
      }

      console.log(`📚 [Context] File: "${ctx.fileName}" | Topics: ${ctx.totalTopics} | Performance data: ${ctx.hasPerformanceData}`);
    }

    // 2. Weak topics
    const { weakTopics, source } = await getWeakTopics(fileId, 70);

    if (weakTopics.length > 0) {
      const weakLines = weakTopics
        .slice(0, 10) // cap at 10
        .map((t) => {
          const score = t.performanceScore !== null && t.performanceScore !== undefined
            ? `${Number(t.performanceScore).toFixed(1)}%`
            : "not attempted yet";
          return `  - ${t.topicName} (${score})`;
        })
        .join("\n");

      weakBlock = source === "not_attempted"
        ? `\n## Topics the Student Has Not Studied Yet\n${weakLines}\n`
        : `\n## Topics Needing Attention (Under 70%)\n${weakLines}\n`;
    }

    // 3. RAG — relevant chunks for this message
    const chunks = await getRagContext(message, fileId, 4);

    if (chunks.length > 0) {
      const chunkText = chunks
        .map((c, i) => `[Source ${i + 1}] ${c.title}\n${c.summary || c.content || ""}`)
        .join("\n\n");
      ragBlock = `\n## Relevant Content from Student's Documents\n${chunkText}\n`;
    }
  }

  // ─── Compose prompt ──────────────────────────────────────────────────────
  const hasContext = topicsBlock.length > 0;

  const rules = hasContext
    ? `
## YOUR RULES
1. You are ONLY allowed to answer questions about the topics listed above from the student's study material.
2. If asked about something outside these topics, redirect: "That topic isn't in your current study material. Would you like to explore one of your uploaded topics instead?"
3. When the student asks "what should I study?" or "suggest topics", recommend from the "Topics Needing Attention" section.
4. Always use the "Relevant Content" section to ground your answers in the actual study material.
5. Be specific, concise, and educationally focused.
`
    : `
## YOUR RULES
You are a helpful study assistant. Answer the student's questions clearly and concisely.
`;

  return [
    "You are a personalized AI study assistant.",
    conversationSummary ? `\nConversation so far:\n${conversationSummary}` : "",
    topicsBlock,
    weakBlock,
    ragBlock,
    rules,
  ]
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
    } = req.body;
    const userId = req.user.userId;

    console.log("------ New Streaming Chat ------");
    console.log(`chatId: ${chatId} | fileId: ${bodyFileId} | folderId: ${bodyFolderId}`);

    // ─── Resolve fileId (body → ChatSession fallback) ────────────────────
    let fileId = bodyFileId || null;
    let folderId = bodyFolderId || null;

    if (!fileId && !folderId) {
      const session = await ChatSession.findOne({ chatId, userId })
        .select("fileId folderId")
        .lean();
      if (session) {
        fileId = session.fileId || null;
        folderId = session.folderId || null;
        if (fileId || folderId) {
          console.log(`📎 Context from ChatSession — fileId: ${fileId} | folderId: ${folderId}`);
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

    const systemPromptText = await buildSystemPrompt({
      message,
      fileId: resolvedFileId,
      conversationSummary: context.summary,
    });

    console.log(`🧠 System prompt built (${systemPromptText.length} chars) | Has context: ${resolvedFileId ? "YES — " + resolvedFileId : "NO"}`);

    // ─── Build LangChain messages ─────────────────────────────────────────
    const messages = [new SystemMessage(systemPromptText)];

    for (const msg of context.recentMessages) {
      messages.push(
        msg.role === "user"
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      );
    }
    messages.push(new HumanMessage(message));

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
      ]).then(res => {
        const title = res.content.trim().replace(/^["']|["']$/g, "");
        return title;
      }).catch(err => {
        console.error("Failed to generate title:", err);
        return null;
      });
    }

    // ─── Stream LLM response ──────────────────────────────────────────────
    const stream = await model.stream(messages);
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
        ]);

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
      ...context.recentMessages,
      { role: "user", content: message },
      { role: "assistant", content: assistantText },
    ].slice(-8);

    // Generate rolling summary
    const summaryResult = await model.invoke([
      new SystemMessage("Summarize conversations in 2 concise sentences. Focus on topics discussed and key points made."),
      new HumanMessage(
        `Previous summary:\n${context.summary || "(none)"}\n\nRecent messages:\n${updatedMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nUpdated summary:`
      ),
    ]);

    // ─── Save updated context ─────────────────────────────────────────────
    await ChatContext.updateOne(
      { chatId },
      {
        $set: {
          summary: summaryResult.content,
          recentMessages: updatedMessages,
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