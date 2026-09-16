import { ChatGroq } from "@langchain/groq";

export const model = new ChatGroq({
  // Groq retired llama-3.1-8b-instant → use gpt-oss-20b (drop-in replacement).
  model: "openai/gpt-oss-20b",
  temperature: 0.7, // 0.7 for more conversational chat
  maxRetries: 1, // Prevent silent exponential backoff hanging
  timeout: 30000,
});