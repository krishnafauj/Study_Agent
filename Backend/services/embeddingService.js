/**
 * embeddingService.js
 *
 * Embeds a query with the SAME model used to embed chunks
 * (text-embedding-3-small, 1536-d) and provides cosine similarity so RAG
 * retrieval is semantic instead of keyword/regex based.
 *
 * In-memory cosine is used because it works everywhere and a single file only
 * has a few hundred chunks. For large corpora, move to MongoDB Atlas
 * $vectorSearch (see note in getRagContext).
 */
import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";

let _client = null;
function client() {
  if (_client) return _client;
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// Simple in-process cache so repeated queries in a session don't re-embed.
const _cache = new Map();

export async function embedQuery(text) {
  const key = String(text || "").trim().slice(0, 512);
  if (!key) return null;
  if (_cache.has(key)) return _cache.get(key);

  const res = await client().embeddings.create({ model: EMBED_MODEL, input: key });
  const vec = res?.data?.[0]?.embedding || null;
  if (vec) {
    if (_cache.size > 500) _cache.clear();
    _cache.set(key, vec);
  }
  return vec;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
