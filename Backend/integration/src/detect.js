// ─────────────────────────────────────────────
// Document-type + known-book detection (Groq). Cheap, single-shot each.
// ─────────────────────────────────────────────
import { llmJson } from "./llm.js";
import { CONFIG } from "./config.js";
import { normalizeText } from "./utils.js";

const DOC_TYPES = ["book", "chapter", "notes", "dpp", "worksheet", "question_paper", "solved_paper", "mixed"];

export async function detectDocumentType(text, fileName = "") {
  const sample = normalizeText(`${fileName}\n${text}`).slice(0, CONFIG.detect.docTypeChars);
  const res = await llmJson(
    `Classify the document into exactly one type: ${DOC_TYPES.join(", ")}.
Return {"type":"<one>"}. Prefer the dominant type. Theory+questions+solutions => mixed.`,
    sample,
    { label: "DOC-TYPE", fallback: { type: "mixed" } }
  );
  return DOC_TYPES.includes(res?.type) ? res.type : "mixed";
}

export async function detectKnownBook(text, fileName = "") {
  const sample = normalizeText(`${fileName}\n${text}`).slice(0, CONFIG.detect.bookMetaChars);
  const res = await llmJson(
    `Detect whether this matches a known textbook or exam source. Be conservative;
only set recognized=true for strong matches. Return JSON:
{"recognized":bool,"book_name":"","class":"","subject":"","board_or_exam":"","confidence":0.0}`,
    sample,
    { label: "BOOK-DETECT", fallback: { recognized: false } }
  );
  return {
    recognized: Boolean(res?.recognized),
    book_name: String(res?.book_name || "").trim(),
    class: String(res?.class || "").trim(),
    subject: String(res?.subject || "").trim(),
    board_or_exam: String(res?.board_or_exam || "").trim(),
    confidence: Number(res?.confidence || 0),
  };
}
