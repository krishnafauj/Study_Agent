import ChatContext from "../../models/ChatContextSchema.js";
import ChatMessage from "../../models/chatMessage.js";
import { chatbot } from "./chatbotGraph.js";

import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);
const its = nlp.its;

export const chatHandler = async (req, res) => {
  try {

    console.log("------ New Chat Request ------");

    const { chatId, message } = req.body;

    console.log("Chat ID:", chatId);
    console.log("User Message:", message);

    // -------- Extract keywords using wink-nlp --------

    const doc = nlp.readDoc(message);

    const keywords = doc.tokens()
      .filter(t => ["NOUN", "VERB"].includes(t.out(its.pos)))
      .out();

    console.log("Extracted Keywords:", keywords);

    // -------- Load chat context --------

    let context = await ChatContext.findOne({ chatId });

    if (!context) {
      console.log("No existing context found. Creating new context...");

      context = await ChatContext.create({
        chatId,
        summary: "",
        recentMessages: []
      });
    } else {
      console.log("Existing context loaded");
      console.log("Current Summary:", context.summary);
    }

    // -------- CALL 1: Generate reply --------

    const promptInput = {
      message,
      keywords,
      summary: context.summary,
      recentMessages: context.recentMessages
    };

    console.log("Sending prompt to chatbot...");
    console.log(promptInput);

    const result = await chatbot.invoke(promptInput);

    const reply = result.response;

    console.log("Chatbot Reply:", reply);

    // -------- Save messages --------

    await ChatMessage.insertMany([
      { chatId, role: "user", content: message },
      { chatId, role: "assistant", content: reply }
    ]);

    console.log("Messages saved to database");

    // -------- Update short-term memory --------

    const updatedMessages = [
      ...context.recentMessages,
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ].slice(-6); // keep last 6 messages

    console.log("Updated Recent Messages:", updatedMessages);

    // -------- CALL 2: Update summary --------

    const summaryPrompt = `
Previous summary:
${context.summary}

Recent conversation:
${updatedMessages
  .map(m => `${m.role}: ${m.content}`)
  .join("\n")}

Write an updated summary of this conversation in 2 sentences.
`;

    console.log("Generating updated summary...");

    const summaryResult = await chatbot.invoke({
      message: summaryPrompt
    });

    const newSummary = summaryResult.response;

    console.log("New Summary:", newSummary);

    // -------- Save updated context --------

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

    console.log("Context updated successfully");

    // -------- Send reply --------

    console.log("Sending response to client...");
    console.log("-------------------------------");

    res.json({ reply });

  } catch (error) {

    console.error("Chatbot error:", error);

    res.status(500).json({
      error: "Chatbot failed"
    });

  }
};