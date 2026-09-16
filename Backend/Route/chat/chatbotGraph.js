import { ChatGroq } from "@langchain/groq";

export const model = new ChatGroq({
  model: "llama-3.1-8b-instant",
  temperature: 0.7, // 0.7 for more conversational chat
  maxRetries: 1, // Prevent silent exponential backoff hanging
  timeout: 30000,
});