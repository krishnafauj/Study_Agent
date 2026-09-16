// Usage:
//   GROQ_API_KEY=... OPENAI_API_KEY=... node example.js path/to/book.pdf
//
// Writes book.chunks.json (RAG-ready) and book.outline.json next to this file.
import { writeFile } from "fs/promises";
import { processFromFile } from "./src/pipeline.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node example.js <path-to-pdf>");
  process.exit(1);
}

const result = await processFromFile(path, {
  refineOutline: true,       // LLM tidies chapter/topic nesting
  useLlmContentType: true,   // LLM resolves ambiguous content types
  embed: true,               // set false to skip OpenAI embeddings while testing
  progress: (e) => console.log(`  → ${e.status} ${e.progress ?? ""}%`),
});

await writeFile("book.outline.json", JSON.stringify(result.outline, null, 2));
// Strip embeddings from the human-readable dump; keep them in a separate file.
const lite = result.chunks.map(({ embedding, embedText, ...c }) => c);
await writeFile("book.chunks.json", JSON.stringify(lite, null, 2));
await writeFile("book.embeddings.json", JSON.stringify(
  result.chunks.map((c) => ({ id: c.id, embedding: c.embedding })), null, 2));

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(result.stats, null, 2));
console.log(`\nWrote book.outline.json, book.chunks.json, book.embeddings.json`);
