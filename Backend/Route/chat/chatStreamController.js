import { model } from "./chatbotGraph.js";

export const chatStreamHandler = async (req, res) => {

  try {

    const { message } = req.body;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // stream response from LLM
    const stream = await model.stream(message);

    for await (const chunk of stream) {

      const token = chunk.content || "";

      res.write(`data: ${token}\n\n`);

    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {

    console.error("Streaming error:", error);

    res.write(`data: ERROR\n\n`);
    res.end();

  }
};