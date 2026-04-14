import { model } from "./chatbotGraph.js";
import ChatMessage from "../../models/chatMessage.js";
import ChatSession from "../../models/chatSession.js";
import ChatContext from "../../models/ChatContextSchema.js";

import {
  HumanMessage,
  AIMessage,
  SystemMessage
} from "@langchain/core/messages";

import winkNLP from "wink-nlp";
import winkModel from "wink-eng-lite-web-model";

const nlp = winkNLP(winkModel);
const its = nlp.its;

export const chatStreamHandler = async (req, res) => {

  try {

    const { message, chatId } = req.body;
    const userId = req.user.userId;

    console.log("------ New Streaming Chat ------");

    // -------- Extract keywords --------
    const doc = nlp.readDoc(message);

    const keywords = doc.tokens()
      .filter(t =>
        ["NOUN", "VERB"].includes(t.out(its.pos)) &&
        t.out().length > 3
      )
      .out();

    console.log("Keywords:", keywords);

    // -------- Load Chat Context --------
    let context = await ChatContext.findOne({ chatId });

    if (!context) {
      context = await ChatContext.create({
        chatId,
        summary: "",
        recentMessages: []
      });
    }

    // -------- Build LangChain Messages --------
    const messages = [
      new SystemMessage(`
You are a helpful study assistant.

Conversation summary:
${context.summary}

Important keywords from user message:
${keywords.join(", ")}

Respond clearly and helpfully.
`)
    ];

    // Add previous messages
    for (const msg of context.recentMessages) {

      if (msg.role === "user") {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }

    }

    // Add current message
    messages.push(new HumanMessage(message));

    // -------- Setup SSE Headers --------
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // -------- STREAM LLM RESPONSE --------
    const stream = await model.stream(messages);

    let assistantText = "";

    for await (const chunk of stream) {

      const token = chunk.content || "";

      assistantText += token;

      res.write(`data: ${token}\n\n`);

    }

    // -------- Save Chat Messages --------
    await ChatMessage.insertMany([
      { chatId, userId, role: "user", content: message },
      { chatId, userId, role: "assistant", content: assistantText },
    ]);

    // -------- Update Chat Session --------
    await ChatSession.findOneAndUpdate(
      { chatId, userId },
      {
        $setOnInsert: {
          title: message.trim().slice(0, 60),
        },
      },
      { upsert: true, new: true }
    );

    // -------- Update Memory --------
    const updatedMessages = [
      ...context.recentMessages,
      { role: "user", content: message },
      { role: "assistant", content: assistantText }
    ].slice(-8); // keep last 8 messages

    // -------- Generate Updated Summary --------
    const summaryPrompt = `
Previous summary:
${context.summary}

Recent conversation:
${updatedMessages
  .map(m => `${m.role}: ${m.content}`)
  .join("\n")}

Write an updated summary of the conversation in 2 sentences.
`;

    const summaryMessages = [
      new SystemMessage("You summarize conversations."),
      new HumanMessage(summaryPrompt)
    ];

    const summaryResult = await model.invoke(summaryMessages);

    const newSummary = summaryResult.content;

    // -------- Save Context --------
    await ChatContext.updateOne(
      { chatId },
      {
        $set: {
          summary: newSummary,
          recentMessages: updatedMessages,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // -------- Finish SSE --------
    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {

    console.error("Streaming error:", error);

    res.write(`data: ERROR\n\n`);
    res.end();

  }
};