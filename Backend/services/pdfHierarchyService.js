import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import OpenAI from "openai";

// ─────────────────────────────────────────────
// pdfjs-dist — primary extractor (ESM-safe)
// npm install pdfjs-dist
// ─────────────────────────────────────────────
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  embeddingModel:      "text-embedding-3-small",
  analyzerModel:       "gpt-4o-mini",
  enrichModel:         "gpt-4o-mini",
  docDetectChars:      6000,
  bookDetectChars:     5000,
  structureChunkSize:  12000,
  structureChunkOverlap: 1000,
  embedTextLimit:      8000,
  maxStructureTokens:  3500,
  minWordCount:        30,       // sanity check — below this = garbage extract
  lineBreakThreshold:  5,        // y-gap in pts to insert newline (pdfjs)
};

// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────
const log   = (s, m, e = null) => e ? console.log(`📘 [${s}]`, m, e)  : console.log(`📘 [${s}]`, m);
const warn  = (s, m, e = null) => e ? console.warn(`⚠️  [${s}]`, m, e) : console.warn(`⚠️  [${s}]`, m);
const error = (s, m, e = null) => e ? console.error(`❌ [${s}]`, m, e) : console.error(`❌ [${s}]`, m);

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCodeFences(text) {
  return String(text || "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function extractBalancedJson(text) {
  const cleaned = stripCodeFences(text);
  const firstArray  = cleaned.indexOf("[");
  const firstObject = cleaned.indexOf("{");

  let start = -1, open = "", close = "";

  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    start = firstArray; open = "["; close = "]";
  } else if (firstObject !== -1) {
    start = firstObject; open = "{"; close = "}";
  } else {
    throw new Error("No JSON start found");
  }

  let depth = 0, inString = false, escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped)            { escaped = false; continue; }
    if (ch === "\\")        { escaped = true;  continue; }
    if (ch === '"')         { inString = !inString; continue; }
    if (inString)           continue;
    if (ch === open)        depth++;
    if (ch === close)       depth--;
    if (depth === 0)        return cleaned.slice(start, i + 1);
  }

  throw new Error("No balanced JSON found");
}

function safeJsonParse(text) {
  return JSON.parse(extractBalancedJson(text));
}

function sanitizeNode(node) {
  return {
    title:    String(node?.title   || "").trim(),
    level:    Number.isFinite(node?.level) ? node.level : 0,
    content:  String(node?.content || "").trim(),
    children: Array.isArray(node?.children) ? node.children.map(sanitizeNode) : [],
  };
}

async function withRetry(fn, retries = 3, delayMs = 750, label = "API") {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      warn(label, `Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────
// EXTRACTION METHOD 1 — pdfjs-dist (primary)
// Best for: clean PDFs, notes, question papers, most textbooks
// ─────────────────────────────────────────────
async function extractWithPdfjs(buffer) {
  log("PDFJS", "Starting extraction with pdfjs-dist");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts:      true,
    disableFontFace:     true,
    verbosity:           0,           // suppress internal warnings
  });

  const pdf = await loadingTask.promise;
  log("PDFJS", `PDF has ${pdf.numPages} pages`);

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent({ normalizeWhitespace: true });

    // ── Reconstruct lines using y-position tracking ──────────────────
    // pdfjs gives items in render order (not reading order).
    // Sort by y descending (top of page first), then x ascending.
    const items = content.items
      .filter(item => item.str && item.str.trim() !== "")
      .sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > CONFIG.lineBreakThreshold) return yDiff;
        return a.transform[4] - b.transform[4]; // same line → left to right
      });

    let lastY    = null;
    let pageText = "";

    for (const item of items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > CONFIG.lineBreakThreshold) {
        pageText += "\n";
      }
      pageText += item.str + " ";
      lastY = y;
    }

    fullText += `\n\n--- Page ${i} ---\n${pageText.trim()}`;
  }

  const wordCount = fullText.trim().split(/\s+/).length;
  log("PDFJS", `Extracted ${pdf.numPages} pages, ${fullText.length} chars, ~${wordCount} words`);

  if (wordCount < CONFIG.minWordCount) {
    throw new Error(`pdfjs extracted only ${wordCount} words — likely a scanned/image PDF`);
  }

  return {
    fullText:   normalizeText(fullText),
    pages:      pdf.numPages,
    totalPages: pdf.numPages,
    method:     "pdfjs",
  };
}

// ─────────────────────────────────────────────
// EXTRACTION METHOD 2 — PyMuPDF (fallback)
// Best for: multi-column books, scanned PDFs, complex layouts
// Requires: pip install pymupdf
// ─────────────────────────────────────────────

const PYMUPDF_SCRIPT = `
import sys, json, fitz

def extract(path):
    doc  = fitz.open(path)
    pages = []

    for i, page in enumerate(doc):
        # "dict" mode gives blocks → lines → spans for best structure
        data   = page.get_text("dict", flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE)
        blocks = data.get("blocks", [])
        lines  = []

        for block in blocks:
            if block.get("type") != 0:   # 0 = text block, 1 = image
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text  = " ".join(s["text"] for s in spans if s.get("text","").strip())
                if text.strip():
                    lines.append(text.strip())

        pages.append({
            "page":  i + 1,
            "text":  "\\n".join(lines),
            "width": page.rect.width,
            "height": page.rect.height,
        })

    print(json.dumps({"pages": pages, "total": len(doc), "success": True}))

try:
    extract(sys.argv[1])
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`.trim();

async function extractWithPyMuPDF(buffer) {
  log("PYMUPDF", "Starting extraction with PyMuPDF");

  // Write buffer to a temp file
  const tmpDir  = await mkdtemp(join(tmpdir(), "pdf-extract-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const pyPath  = join(tmpDir, "extract.py");

  try {
    await writeFile(pdfPath, buffer);
    await writeFile(pyPath,  PYMUPDF_SCRIPT);

    const stdout = await new Promise((resolve, reject) => {
      execFile("python3", [pyPath, pdfPath], { maxBuffer: 50 * 1024 * 1024 }, (err, out, stderr) => {
        if (err) return reject(new Error(`PyMuPDF process error: ${err.message}\n${stderr}`));
        resolve(out);
      });
    });

    const data = JSON.parse(stdout.trim());

    if (!data.success) {
      throw new Error(`PyMuPDF script error: ${data.error}`);
    }

    const fullText = data.pages.map(p => `\n\n--- Page ${p.page} ---\n${p.text}`).join("");
    const wordCount = fullText.trim().split(/\s+/).length;

    log("PYMUPDF", `Extracted ${data.total} pages, ${fullText.length} chars, ~${wordCount} words`);

    if (wordCount < CONFIG.minWordCount) {
      throw new Error(`PyMuPDF extracted only ${wordCount} words — PDF may be scanned images only`);
    }

    return {
      fullText:   normalizeText(fullText),
      pages:      data.total,
      totalPages: data.total,
      method:     "pymupdf",
    };
  } finally {
    // Cleanup temp files
    await unlink(pdfPath).catch(() => {});
    await unlink(pyPath).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// EXTRACTION METHOD 3 — OCR via Tesseract (last resort)
// Best for: fully scanned PDFs with no embedded text
// Requires: pip install pymupdf pytesseract pillow
//           apt-get install tesseract-ocr
// ─────────────────────────────────────────────

const OCR_SCRIPT = `
import sys, json, fitz
import pytesseract
from PIL import Image
import io

def ocr_extract(path):
    doc   = fitz.open(path)
    pages = []

    for i, page in enumerate(doc):
        mat    = fitz.Matrix(2.0, 2.0)   # 2x zoom = ~144 DPI
        clip   = page.get_pixmap(matrix=mat, alpha=False)
        img    = Image.open(io.BytesIO(clip.tobytes("png")))
        text   = pytesseract.image_to_string(img, lang="eng")
        pages.append({"page": i + 1, "text": text.strip()})

    print(json.dumps({"pages": pages, "total": len(doc), "success": True}))

try:
    ocr_extract(sys.argv[1])
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`.trim();

async function extractWithOCR(buffer) {
  log("OCR", "Starting OCR extraction (last resort — slow)");

  const tmpDir  = await mkdtemp(join(tmpdir(), "pdf-ocr-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const pyPath  = join(tmpDir, "ocr.py");

  try {
    await writeFile(pdfPath, buffer);
    await writeFile(pyPath,  OCR_SCRIPT);

    const stdout = await new Promise((resolve, reject) => {
      // OCR is slow — give it 5 minutes
      execFile("python3", [pyPath, pdfPath], { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }, (err, out, stderr) => {
        if (err) return reject(new Error(`OCR process error: ${err.message}\n${stderr}`));
        resolve(out);
      });
    });

    const data = JSON.parse(stdout.trim());

    if (!data.success) {
      throw new Error(`OCR script error: ${data.error}`);
    }

    const fullText  = data.pages.map(p => `\n\n--- Page ${p.page} ---\n${p.text}`).join("");
    const wordCount = fullText.trim().split(/\s+/).length;

    log("OCR", `OCR done — ${data.total} pages, ~${wordCount} words`);

    return {
      fullText:   normalizeText(fullText),
      pages:      data.total,
      totalPages: data.total,
      method:     "ocr",
    };
  } finally {
    await unlink(pdfPath).catch(() => {});
    await unlink(pyPath).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// MASTER EXTRACTOR — tries all methods in order
// pdfjs → pymupdf → ocr
// ─────────────────────────────────────────────
async function extractTextFromBuffer(buffer) {
  const errors = [];

  // ── Method 1: pdfjs-dist ─────────────────────────────────────────────
  try {
    const result = await extractWithPdfjs(buffer);
    log("EXTRACT", `✅ pdfjs succeeded (${result.pages} pages)`);
    return result;
  } catch (err) {
    warn("EXTRACT", `pdfjs failed: ${err.message}`);
    errors.push(`pdfjs: ${err.message}`);
  }

  // ── Method 2: PyMuPDF ────────────────────────────────────────────────
  try {
    const result = await extractWithPyMuPDF(buffer);
    log("EXTRACT", `✅ PyMuPDF succeeded (${result.pages} pages)`);
    return result;
  } catch (err) {
    warn("EXTRACT", `PyMuPDF failed: ${err.message}`);
    errors.push(`pymupdf: ${err.message}`);
  }

  // ── Method 3: OCR ────────────────────────────────────────────────────
  try {
    const result = await extractWithOCR(buffer);
    log("EXTRACT", `✅ OCR succeeded (${result.pages} pages)`);
    return result;
  } catch (err) {
    warn("EXTRACT", `OCR failed: ${err.message}`);
    errors.push(`ocr: ${err.message}`);
  }

  // All methods failed
  throw new Error(`All PDF extraction methods failed:\n${errors.join("\n")}`);
}

// ─────────────────────────────────────────────
// S3 FETCH + EXTRACT
// ─────────────────────────────────────────────
export async function extractTextFromS3PDF(s3Key) {
  log("S3", `Fetching PDF: ${s3Key}`);

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key:    s3Key,
  });

  const response  = await s3Client.send(command);
  const pdfBuffer = Buffer.from(await response.Body.transformToByteArray());

  log("S3", `Downloaded ${pdfBuffer.length} bytes`);

  const extracted = await extractTextFromBuffer(pdfBuffer);

  return {
    ...extracted,
    fileHash:   sha256Buffer(pdfBuffer),
    byteLength: pdfBuffer.length,
  };
}

// ─────────────────────────────────────────────
// DOCUMENT TYPE DETECTION
// ─────────────────────────────────────────────
export async function detectDocumentType(text, fileName = "") {
  const sample = normalizeText(`${fileName}\n${text}`).slice(0, CONFIG.docDetectChars);

  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model:       CONFIG.analyzerModel,
      temperature: 0,
      messages: [
        {
          role:    "system",
          content: `
You are a document classifier.

Classify the uploaded document into exactly one label:
book | chapter | notes | dpp | worksheet | question_paper | solved_paper | mixed

Rules:
- Return ONLY the label.
- Prefer the dominant document type.
- If the document contains many questions with exam sections → question_paper.
- If it is a practice set/homework sheet → dpp or worksheet.
- If it is a textbook chapter or full book → chapter or book.
- If the document mixes theory + questions + solutions → mixed.
`.trim(),
        },
        { role: "user", content: sample },
      ],
    });

    const label   = String(response.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const allowed = new Set(["book","chapter","notes","dpp","worksheet","question_paper","solved_paper","mixed"]);
    return allowed.has(label) ? label : "mixed";
  }, 3, 700, "DOC TYPE");
}

// ─────────────────────────────────────────────
// KNOWN BOOK DETECTION
// ─────────────────────────────────────────────
export async function detectKnownBook(text, fileName = "") {
  const sample = normalizeText(`${fileName}\n${text}`).slice(0, CONFIG.bookDetectChars);

  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model:       CONFIG.analyzerModel,
      temperature: 0,
      messages: [
        {
          role:    "system",
          content: `
You detect whether the document matches a known textbook or exam source.
Return ONLY valid JSON:
{
  "recognized": true,
  "book_name": "string",
  "class": "string or empty",
  "subject": "string or empty",
  "board_or_exam": "string or empty",
  "syllabus_key": "string or empty",
  "confidence": 0.0
}
Or if not recognized: same schema with recognized=false, empty strings, confidence=0.0
Be conservative. Only mark recognized=true for strong matches.
`.trim(),
        },
        { role: "user", content: sample },
      ],
    });

    const content = response.choices?.[0]?.message?.content || "";
    const parsed  = safeJsonParse(content);

    return {
      recognized:   Boolean(parsed.recognized),
      book_name:    String(parsed.book_name    || "").trim(),
      class:        String(parsed.class        || "").trim(),
      subject:      String(parsed.subject      || "").trim(),
      board_or_exam: String(parsed.board_or_exam || "").trim(),
      syllabus_key: String(parsed.syllabus_key || "").trim(),
      confidence:   Number(parsed.confidence   || 0),
    };
  }, 3, 700, "BOOK DETECT");
}

// ─────────────────────────────────────────────
// CHUNKING
// ─────────────────────────────────────────────
function chunkTextSmart(text, maxChars = CONFIG.structureChunkSize, overlap = CONFIG.structureChunkOverlap) {
  const clean      = normalizeText(text);
  if (!clean)      return [];

  const paragraphs = clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks     = [];
  let current      = "";

  const pushCurrent = () => {
    const chunk = current.trim();
    if (chunk) chunks.push(chunk);
    current = "";
  };

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }

    if (current) pushCurrent();

    if (para.length <= maxChars) {
      current = para;
      continue;
    }

    // Para too big — split with overlap
    let start = 0;
    while (start < para.length) {
      const end = Math.min(start + maxChars, para.length);
      chunks.push(para.slice(start, end).trim());
      start = end - overlap;
      if (start < 0 || start >= para.length || end === para.length) break;
    }
  }

  if (current) pushCurrent();
  return chunks.filter(Boolean);
}

// ─────────────────────────────────────────────
// STRUCTURE EXTRACTION
// ─────────────────────────────────────────────
function buildStructurePrompt(docType, bookMeta, chunkIndex, totalChunks) {
  const bookHint = bookMeta?.recognized
    ? `Known source: ${bookMeta.book_name} | Class: ${bookMeta.class} | Subject: ${bookMeta.subject} | Board: ${bookMeta.board_or_exam}`
    : "Known book/source hint: none";

  return `
You are a senior document-structure reconstruction engine.
Document type: ${docType}
Chunk: ${chunkIndex + 1} of ${totalChunks}
${bookHint}

Your task: Reconstruct the TRUE hierarchy from this chunk.

Rules:
- Do NOT invent topics. Only what is actually in the text.
- Preserve actual headings, question numbers, subparts, examples, exercises, formulas, solution steps.
- If question paper → keep section labels and question numbering.
- If book/chapter → keep chapter/section/subsection/exercise structure.
- If DPP/worksheet → keep problem groups and individual questions.
- If solved paper → keep question → solution structure.
- Ignore repeated boilerplate headers/footers.
- Use 0–3 levels only.
- Every node must be meaningful.

Return ONLY valid JSON array:
[
  {
    "title": "string",
    "level": 0,
    "content": "2-4 sentence explanation of what this node contains",
    "children": [
      {
        "title": "string",
        "level": 1,
        "content": "2-4 sentence explanation",
        "children": []
      }
    ]
  }
]
`.trim();
}

async function analyzeStructureChunk(chunk, docType, bookMeta, chunkIndex, totalChunks) {
  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model:      CONFIG.analyzerModel,
      temperature: 0.15,
      max_tokens: CONFIG.maxStructureTokens,
      messages: [
        { role: "system", content: buildStructurePrompt(docType, bookMeta, chunkIndex, totalChunks) },
        { role: "user",   content: chunk },
      ],
    });

    const content = response.choices?.[0]?.message?.content || "[]";
    const parsed  = safeJsonParse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeNode);
  }, 3, 800, "STRUCTURE");
}

function mergeNodeArrays(baseNodes, incomingNodes) {
  const map   = new Map();
  const keyOf = node => {
    const title = String(node?.title || "").trim().toLowerCase().replace(/\s+/g, " ");
    const level = Number.isFinite(node?.level) ? node.level : 0;
    return `${level}::${title}`;
  };

  for (const node of baseNodes || []) {
    const s = sanitizeNode(node);
    map.set(keyOf(s), s);
  }

  for (const node of incomingNodes || []) {
    const s   = sanitizeNode(node);
    const key = keyOf(s);

    if (!map.has(key)) {
      map.set(key, s);
      continue;
    }

    const existing = map.get(key);

    if (s.content && s.content !== existing.content && !existing.content.includes(s.content)) {
      existing.content = `${existing.content}\n${s.content}`.trim();
    }

    existing.children = mergeNodeArrays(existing.children || [], s.children || []);
    map.set(key, existing);
  }

  return [...map.values()];
}

async function analyzeHierarchicalStructure(text, docType, bookMeta) {
  const chunks = chunkTextSmart(text);
  if (!chunks.length) return [];

  log("STRUCTURE", `Chunked into ${chunks.length} segment(s)`);

  let merged = [];

  for (let i = 0; i < chunks.length; i++) {
    log("STRUCTURE", `Analyzing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
    const nodes = await analyzeStructureChunk(chunks[i], docType, bookMeta, i, chunks.length);
    merged = mergeNodeArrays(merged, nodes);
  }

  if (bookMeta?.recognized) {
    merged = await enrichWithKnownBook(merged, bookMeta);
  }

  return merged;
}

// ─────────────────────────────────────────────
// BOOK-AWARE ENRICHMENT
// ─────────────────────────────────────────────
async function enrichWithKnownBook(hierarchy, bookMeta) {
  if (!bookMeta?.recognized || !bookMeta?.book_name) return hierarchy;

  return withRetry(async () => {
    const response = await openai.chat.completions.create({
      model:      CONFIG.enrichModel,
      temperature: 0.15,
      max_tokens: CONFIG.maxStructureTokens,
      messages: [
        {
          role:    "system",
          content: `
You are refining an extracted outline for a known textbook/exam source.
Book: ${bookMeta.book_name} | Class: ${bookMeta.class} | Subject: ${bookMeta.subject} | Board: ${bookMeta.board_or_exam}
Rules:
- Improve alignment ONLY if the structure clearly supports it.
- Do NOT invent chapters or questions.
- Keep hierarchy faithful to the PDF.
- Return ONLY valid JSON array in the same schema.
`.trim(),
        },
        { role: "user", content: JSON.stringify(hierarchy) },
      ],
    });

    const content = response.choices?.[0]?.message?.content || "[]";
    const parsed  = safeJsonParse(content);
    if (!Array.isArray(parsed)) return hierarchy;
    return parsed.map(sanitizeNode);
  }, 2, 700, "ENRICH");
}

// ─────────────────────────────────────────────
// EMBEDDINGS
// ─────────────────────────────────────────────
async function getEmbeddingsBatch(texts) {
  const inputs = texts.map(t => normalizeText(t).slice(0, CONFIG.embedTextLimit));

  const response = await withRetry(async () => {
    return openai.embeddings.create({ model: CONFIG.embeddingModel, input: inputs });
  }, 3, 600, "EMBEDDING");

  return response.data.map(item => item.embedding);
}

function collectNodes(nodes, parentPath = [], level = 0, output = []) {
  for (const node of nodes || []) {
    const title = String(node.title || "").trim();
    const path  = [...parentPath, title].filter(Boolean);

    output.push({
      node,
      level,
      path: path.join(" > "),
      text: `${title}\n${String(node.content || "").trim()}`.trim(),
    });

    if (node.children?.length) collectNodes(node.children, path, level + 1, output);
  }
  return output;
}

async function attachEmbeddingsToHierarchy(hierarchy) {
  const flatRefs = collectNodes(hierarchy);
  if (!flatRefs.length) return { hierarchy, flatTopics: [] };

  const batchSize = 64;
  for (let i = 0; i < flatRefs.length; i += batchSize) {
    const batch      = flatRefs.slice(i, i + batchSize);
    const embeddings = await getEmbeddingsBatch(batch.map(x => x.text || x.path));
    batch.forEach((item, idx) => { item.node.embedding = embeddings[idx] || []; });
    log("EMBED", `Embedded ${Math.min(i + batchSize, flatRefs.length)}/${flatRefs.length}`);
  }

  const flatTopics = flatRefs.map(item => ({
    title:      item.node.title,
    level:      item.level,
    parentPath: item.path.split(" > ").slice(0, -1).join(" > ") || null,
    path:       item.path,
    content:    item.node.content   || "",
    embedding:  item.node.embedding || [],
    children:   item.node.children  || [],
  }));

  return { hierarchy, flatTopics };
}

// ─────────────────────────────────────────────
// OPTIONAL CACHE / DB HOOKS
// ─────────────────────────────────────────────
async function lookupCachedResult(adapters, fileHash) {
  if (typeof adapters?.lookupByHash !== "function") return null;
  return adapters.lookupByHash(fileHash);
}

async function saveProcessedResult(adapters, payload) {
  if (typeof adapters?.saveResult !== "function") return;
  return adapters.saveResult(payload);
}

// ─────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────
export async function processPDFHierarchy(
  s3Key,
  fileName        = "",
  fileId          = "",
  userId          = "",
  progressCallback = () => {},
  adapters        = {}
) {
  try {
    log("MAIN", "Starting PDF hierarchy processing");
    log("MAIN", `File: ${fileName} | FileID: ${fileId} | UserID: ${userId} | S3Key: ${s3Key}`);

    // ── Step 1: Extract text ─────────────────────────────────────────
    progressCallback({ status: "extracting", progress: 5, message: "Extracting PDF text..." });
    const pdfData = await extractTextFromS3PDF(s3Key);
    log("MAIN", `Extraction method used: ${pdfData.method}`);
    log("MAIN", `File hash: ${pdfData.fileHash}`);

    // ── Step 2: Cache check ──────────────────────────────────────────
    progressCallback({ status: "checking_cache", progress: 10, message: "Checking if PDF already exists..." });
    const cached = await lookupCachedResult(adapters, pdfData.fileHash);
    if (cached) {
      log("MAIN", "Cache hit. Reusing existing structure.");
      return { ...cached, reused: true, fileHash: pdfData.fileHash, success: true };
    }

    // ── Step 3: Detect type & book ───────────────────────────────────
    progressCallback({ status: "detecting", progress: 18, message: "Detecting document type and known book..." });
    const [docType, bookMeta] = await Promise.all([
      detectDocumentType(pdfData.fullText, fileName),
      detectKnownBook(pdfData.fullText, fileName),
    ]);
    log("MAIN", `Document type: ${docType}`);
    log("MAIN", `Book recognition: ${bookMeta.recognized ? bookMeta.book_name : "not recognized"}`);

    // ── Step 4: Structure analysis ───────────────────────────────────
    progressCallback({ status: "analyzing", progress: 30, message: "Analyzing structure..." });
    const hierarchy = await analyzeHierarchicalStructure(pdfData.fullText, docType, bookMeta);

    // ── Step 5: Embeddings ───────────────────────────────────────────
    progressCallback({ status: "embedding", progress: 65, message: "Generating embeddings..." });
    const { flatTopics } = await attachEmbeddingsToHierarchy(hierarchy);

    // ── Step 6: Save ─────────────────────────────────────────────────
    const result = {
      success:      true,
      reused:       false,
      fileHash:     pdfData.fileHash,
      fileId,
      userId,
      fileName,
      pages:        pdfData.totalPages,
      byteLength:   pdfData.byteLength,
      extractMethod: pdfData.method,
      docType,
      bookMeta,
      hierarchy,
      topics:       flatTopics,
      totalTopics:  flatTopics.length,
      processedAt:  new Date().toISOString(),
    };

    progressCallback({ status: "saving", progress: 90, message: "Saving processed result..." });
    await saveProcessedResult(adapters, result);

    progressCallback({ status: "done", progress: 100, message: "PDF processing complete." });
    log("MAIN", `Done. Topics: ${flatTopics.length}, Pages: ${pdfData.totalPages}, Method: ${pdfData.method}`);

    return result;
  } catch (err) {
    error("MAIN", err.message, err);
    throw err;
  }
}
