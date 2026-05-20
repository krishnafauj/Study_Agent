import express from "express";
import Topic from "../models/topic.js";
import OpenAI from "openai";

const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get("/suggestions", async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch top 20 main topics for the user to keep the prompt size reasonable
    const topics = await Topic.find({ userId, level: 0 })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("title summary")
      .lean();

    if (!topics || topics.length === 0) {
      return res.json({
        success: true,
        suggestions: [
          {
            category: "Study Tip",
            title: "Upload some PDFs",
            description: "Upload some documents and start chatting to get personalized news and study suggestions!",
            relatedTopic: "General"
          }
        ]
      });
    }

    const topicListStr = topics.map(t => `- ${t.title}: ${t.summary}`).join("\n");

    const prompt = `
The user is studying the following topics:
${topicListStr}

Based on these topics, generate 6 pieces of content that include a mix of:
1. Global News (recent developments related to the topics)
2. Study Tips (how to better understand these topics)
3. Interesting Facts (advanced knowledge nuggets related to the topics)

Return the output strictly as a JSON object with a single key "suggestions" which contains an array of objects.
Example format:
{
  "suggestions": [
    {
      "category": "News" | "Study Tip" | "Fact",
      "title": "A catchy title",
      "description": "A short 2-3 sentence description.",
      "relatedTopic": "The name of the related topic from the user's list"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.json({ success: true, suggestions: parsed.suggestions });
  } catch (error) {
    console.error("Suggestions Error:", error);
    res.status(500).json({ success: false, message: "Failed to generate suggestions" });
  }
});

export default router;
