import { chatbot } from "./chatbotGraph.js";

export const chatHandler = async (req, res) => {
  try {

    const { message } = req.body;

    const result = await chatbot.invoke({
      message,
    });

    res.json({
      reply: result.response,
    });

  } catch (error) {

    console.error("Chatbot error:", error);

    res.status(500).json({
      error: "Chatbot failed",
    });

  }
};