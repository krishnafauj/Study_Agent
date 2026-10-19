// ─────────────────────────────────────────────
// Embeddings behind a swappable interface.
// Default: OpenAI text-embedding-3-small.
// To go fully local later, implement `localEmbed` (e.g. transformers.js /
// an Ollama embed model) and set CONFIG.embeddings.provider = "local".
// ─────────────────────────────────────────────
import OpenAI from "openai";
import { observeOpenAI } from "langfuse";
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { withRetry, normalizeText, mapLimit } from "./utils.js";

let _openai = null;
function openai() {
  if (_openai) return _openai;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // Trace embedding calls in Langfuse when keys are configured.
  _openai =
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
      ? observeOpenAI(client, { generationName: "embeddings" })
      : client;
  return _openai;
}

async function openaiEmbed(inputs) {
  const res = await withRetry(
    () => openai().embeddings.create({ model: CONFIG.embeddings.model, input: inputs }),
    { label: "EMBED" }
  );
  return res.data.map((d) => d.embedding);
}

// Placeholder for a local backend (transformers.js / Ollama). Throws until wired.
async function localEmbed() {
  throw new Error("Local embeddings not configured. Implement localEmbed() in embeddings.js.");
}

const backend = () =>
  CONFIG.embeddings.provider === "local" ? localEmbed : openaiEmbed;

/**
 * Embed an array of chunks in place (adds `chunk.embedding`).
 * Batches by CONFIG.embeddings.batchSize; batches run with limited concurrency.
 */
export async function embedChunks(chunks) {
  if (!chunks.length) return chunks;
  const embed = backend();
  const { batchSize, maxCharsPerInput } = CONFIG.embeddings;

  const batches = [];
  for (let i = 0; i < chunks.length; i += batchSize) batches.push(chunks.slice(i, i + batchSize));

  let done = 0;
  await mapLimit(batches, 2, async (batch) => {
    const inputs = batch.map((c) => normalizeText(c.embedText || c.text).slice(0, maxCharsPerInput) || " ");
    const vectors = await embed(inputs);
    batch.forEach((c, i) => (c.embedding = vectors[i] || []));
    done += batch.length;
    logger.info("EMBED", `Embedded ${done}/${chunks.length}`);
  });

  return chunks;
}
