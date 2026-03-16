import { model } from "./chatbotGraph.js";
import ChatMessage from "../../models/chatMessage.js";
import ChatSession from "../../models/chatSession.js";

export const chatStreamHandler = async (req, res) => {

  try {

    const { message, chatId } = req.body;
    const userId = req.user.userId;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // stream response from LLM
    const stream = await model.stream(message);

    let assistantText = "";

    for await (const chunk of stream) {

      const token = chunk.content || "";
      assistantText += token;
      res.write(`data: ${token}\n\n`);

    }

    // Persist both messages + upsert chat session
    if (chatId && userId) {
      await ChatMessage.insertMany([
        { chatId, userId, role: "user", content: message },
        { chatId, userId, role: "assistant", content: assistantText },
      ]);

      // Upsert the chat session — title is set from the first message only
      await ChatSession.findOneAndUpdate(
        { chatId, userId },
        {
          $setOnInsert: {
            // Title: first 60 chars of the user's first message
            title: message.trim().slice(0, 60),
          },
        },
        { upsert: true, new: true, timestamps: true }
      );
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {

    console.error("Streaming error:", error);

    res.write(`data: ERROR\n\n`);
    res.end();

  }
};