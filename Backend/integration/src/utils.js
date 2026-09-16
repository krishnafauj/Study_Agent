import crypto from "crypto";
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";

// ── Hashing ──────────────────────────────────
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ── Text normalization ───────────────────────
export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")            // nbsp
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Join hyphenated line breaks: "photo-\nsynthesis" -> "photosynthesis"
// but keep real hyphens: "well-\nbeing" -> "well-being" only if lowercase+lowercase.
export function dehyphenate(text) {
  return String(text ?? "")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")   // broken word
    .replace(/([A-Za-z])-\n([A-Za-z])/g, "$1-$2"); // keep hyphenated compound
}

export function wordCount(text) {
  const t = String(text ?? "").replace(/\[\[[^\]]+\]\]/g, " "); // ignore placeholders
  const m = t.trim().match(/\S+/g);
  return m ? m.length : 0;
}

// ── Concurrency-limited map (no external deps) ─
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Retry with error classification + jittered backoff ─
const NON_RETRYABLE = new Set([400, 401, 403, 404, 422]);

function statusOf(err) {
  return err?.status ?? err?.response?.status ?? err?.code ?? null;
}

export async function withRetry(fn, { label = "op", attempts = CONFIG.retry.attempts } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      // Do not retry client errors that will never succeed.
      if (typeof status === "number" && NON_RETRYABLE.has(status)) {
        logger.error(label, `Non-retryable error (${status}): ${err.message}`);
        throw err;
      }
      if (attempt >= attempts) break;
      // Respect Retry-After when present (429 / rate limit).
      const retryAfter = Number(err?.response?.headers?.["retry-after"]) * 1000;
      
      // Parse Groq "Please try again in X.Xs." error message
      let groqWaitMs = 0;
      const groqWaitMatch = err?.message?.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
      if (groqWaitMatch) {
        const h = parseFloat(groqWaitMatch[1] || 0);
        const m = parseFloat(groqWaitMatch[2] || 0);
        const s = parseFloat(groqWaitMatch[3] || 0);
        groqWaitMs = (h * 3600 + m * 60 + s) * 1000;
      }

      const backoff = Math.max(
        groqWaitMs,
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : Math.min(CONFIG.retry.maxDelayMs, CONFIG.retry.baseDelayMs * 2 ** (attempt - 1))
      );
      const jitter = Math.random() * 250;
      logger.warn(label, `Attempt ${attempt}/${attempts} failed: ${err.message}. Retrying in ${Math.round(backoff + jitter)}ms`);
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
  throw lastErr;
}

// ── Robust JSON extraction from LLM output ────
export function stripCodeFences(text) {
  // Only strip fences at line starts so backticks inside content survive.
  return String(text ?? "")
    .replace(/^\s*```(?:json)?\s*$/gim, "")
    .trim();
}

export function extractBalancedJson(text) {
  const cleaned = stripCodeFences(text);
  const iArr = cleaned.indexOf("[");
  const iObj = cleaned.indexOf("{");
  let start, open, close;
  if (iArr !== -1 && (iObj === -1 || iArr < iObj)) { start = iArr; open = "["; close = "]"; }
  else if (iObj !== -1) { start = iObj; open = "{"; close = "}"; }
  else throw new Error("No JSON start token found");

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return cleaned.slice(start, i + 1);
  }
  throw new Error("No balanced JSON found (likely truncated output)");
}

export function safeJsonParse(text, fallback = undefined) {
  try {
    return JSON.parse(extractBalancedJson(text));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
