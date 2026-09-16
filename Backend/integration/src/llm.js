// ─────────────────────────────────────────────
// Groq LLM wrapper (llama-3.3-70b-versatile) via @langchain/groq.
// Provides text() and json() helpers with output repair + retries.
// ─────────────────────────────────────────────
import { ChatGroq } from "@langchain/groq";
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { withRetry, safeJsonParse } from "./utils.js";

let _model = null;
function model() {
  if (_model) return _model;
  if (!process.env.GROQ_API_KEY) {
    logger.warn("LLM", "GROQ_API_KEY not set — LLM calls will fail.");
  }
  _model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: CONFIG.llm.model,
    temperature: CONFIG.llm.temperature,
    maxTokens: CONFIG.llm.maxTokens,
    maxRetries: 1, // Let withRetry handle retries
    timeout: 60000 // 60s timeout to prevent hanging forever
  });
  return _model;
}

export async function llmText(system, user, { label = "LLM" } = {}) {
  return withRetry(async () => {
    const res = await model().invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    return String(res?.content ?? "").trim();
  }, { label });
}

/**
 * Ask the LLM for JSON. Uses Groq's json_object response format when possible,
 * falls back to balanced-JSON extraction, and repairs once on parse failure.
 */
export async function llmJson(system, user, { label = "LLM-JSON", fallback = null } = {}) {
  const sys = `${system}\n\nRespond with ONLY valid minified JSON. No prose, no markdown fences.`;
  const raw = await withRetry(async () => {
    const res = await model().invoke(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { response_format: { type: "json_object" } } // Groq supports JSON mode
    );
    return String(res?.content ?? "").trim();
  }, { label });

  const parsed = safeJsonParse(raw, undefined);
  if (parsed !== undefined) return parsed;

  // One repair attempt: hand the broken output back and ask for valid JSON.
  logger.warn(label, "First parse failed — attempting repair pass.");
  try {
    const repaired = await llmText(
      "You fix malformed JSON. Output ONLY corrected, valid, minified JSON.",
      raw,
      { label: `${label}-repair` }
    );
    return safeJsonParse(repaired, fallback);
  } catch (e) {
    logger.error(label, `JSON repair failed: ${e.message}`);
    return fallback;
  }
}
