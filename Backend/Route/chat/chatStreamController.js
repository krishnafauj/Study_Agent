import { model } from "./chatbotGraph.js";
import ChatMessage from "../../models/chatMessage.js";
import ChatSession from "../../models/chatSession.js";
import ChatContext from "../../models/ChatContextSchema.js";

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

    // ─── Stream LLM response ──────────────────────────────────────────────
    const stream = await model.stream(messages);
    let assistantText = "";

    for await (const chunk of stream) {
      const token = chunk.content || "";
      assistantText += token;
      res.write(`data: ${token}\n\n`);
    }

    // ─── Save messages ────────────────────────────────────────────────────
    await ChatMessage.insertMany([
      { chatId, userId, role: "user", content: message },
      { chatId, userId, role: "assistant", content: assistantText },
    ]);

    // ─── Update ChatSession (upsert, set title only on first message) ─────
    await ChatSession.findOneAndUpdate(
      { chatId, userId },
      {
        $setOnInsert: {
          title: message.trim().slice(0, 60),
          ...(contextFileId && { fileId: contextFileId }),
          ...(folderId && { folderId }),
        },
      },
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

    // ─── Done ─────────────────────────────────────────────────────────────
    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {
    console.error("Streaming error:", error);
    res.write(`data: ERROR\n\n`);
    res.end();
  }
};