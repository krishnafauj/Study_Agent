import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { CONFIG } from "./config.js";
import { logger } from "./logger.js";
import { sha256 } from "./utils.js";
import { processChunksConcurrently } from "./llmExtractor.js";
import { embedChunks } from "./embeddings.js";

function compactOutline(node) {
  const kids = (node.children || []).map(compactOutline);
  return {
    id: node.id,
    title: node.title,
    level: node.level,
    summary: node.summary,
    number: node.number || "",
    keyConcepts: node.keyConcepts || [],
    formulas: node.formulas || [],
    mcqs: node.mcqs || [],
    // page metadata (undefined for the whole-document pipeline; set per section)
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    children: kids,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-section extraction helpers (pdfjs-dist reads ONE page at a time, so we can
// extract just a page range without ever parsing — or trimming — the whole PDF).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from ONLY pages [pageStart..pageEnd] of a PDF buffer.
 * Returns { pages: [{ page, text }], totalPages, start, end } — one entry per
 * page so chunks can carry accurate pageStart/pageEnd for access scoping.
 */
/** Fast page count without extracting text — used at upload time. */
export async function getPdfPageCount(buffer) {
  try {
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
    return pdf.numPages || 0;
  } catch (err) {
    logger.warn("PAGE_COUNT", `Failed: ${err.message}`);
    return 0;
  }
}

export async function extractPagesText(buffer, pageStart, pageEnd) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const start = Math.max(1, Number(pageStart) || 1);
  const end = Math.min(Number(pageEnd) || totalPages, totalPages);

  const pages = [];
  for (let n = start; n <= end; n++) {
    try {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      const text = content.items
        .filter((it) => it.str && it.str.trim() !== "")
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: n, text });
    } catch (err) {
      logger.warn("SECTION_EXTRACT", `Page ${n} failed: ${err.message}`);
      pages.push({ page: n, text: "" });
    }
  }
  return { pages, totalPages, start, end };
}

/**
 * Chunk page texts by max char length while tracking the page range each chunk
 * spans. Prefers page boundaries; hard-splits a single oversized page.
 * Returns [{ text, pageStart, pageEnd }].
 */
function chunkPagesByChars(pages, maxChars) {
  const chunks = [];
  let buf = "";
  let pStart = null;
  let pEnd = null;

  const flush = () => {
    const t = buf.trim();
    if (t.length > 50) chunks.push({ text: t, pageStart: pStart, pageEnd: pEnd });
    buf = "";
    pStart = null;
    pEnd = null;
  };

  for (const { page, text } of pages) {
    if (!text) continue;

    // Adding this page would overflow the current buffer — flush what we have.
    if (buf.length && buf.length + text.length > maxChars) flush();
    if (pStart === null) pStart = page;
    pEnd = page;
    buf += (buf ? "\n\n" : "") + text;

    // A single page (or accumulated buffer) larger than maxChars → hard-split.
    while (buf.length > maxChars) {
      let splitPos = buf.lastIndexOf(". ", maxChars);
      if (splitPos <= 0) splitPos = buf.lastIndexOf(" ", maxChars);
      if (splitPos <= 0) splitPos = maxChars;
      const piece = buf.slice(0, splitPos).trim();
      if (piece.length > 50) chunks.push({ text: piece, pageStart: pStart, pageEnd: page });
      buf = buf.slice(splitPos).trim();
      pStart = page;
      pEnd = page;
    }
  }
  flush();
  return chunks;
}

/**
 * Parse ONLY a section's page range: extract → chunk → LLM structure → embed.
 * Returns { outline, chunks, stats } with every node/chunk carrying the real
 * pageStart/pageEnd it came from. Never parses the whole document.
 */
export async function processPageRange(buffer, opts = {}) {
  const {
    pageStart,
    pageEnd,
    sectionTitle = "",
    embed = true,
    progress = () => {},
  } = opts;

  progress({ status: "extracting", progress: 10, message: `Extracting pages ${pageStart}–${pageEnd}...` });
  const { pages, start, end } = await extractPagesText(buffer, pageStart, pageEnd);

  progress({ status: "chunking", progress: 25, message: "Chunking section text..." });
  const pageChunks = chunkPagesByChars(pages, 4000);
  const textChunks = pageChunks.map((c) => c.text);

  if (!textChunks.length) {
    progress({ status: "done", progress: 100, message: "No extractable text in this range." });
    return { outline: [], chunks: [], stats: { totalChunks: 0, pages: end - start + 1, empty: true } };
  }

  progress({ status: "structuring", progress: 40, message: "Extracting structure with LLM..." });
  const extractedJSONs = await processChunksConcurrently(textChunks);

  progress({ status: "building_tree", progress: 80, message: "Assembling section tree..." });
  const rootNodes = [];
  const embeddableChunks = [];

  for (let i = 0; i < pageChunks.length; i++) {
    const { text: chunkText, pageStart: cs, pageEnd: ce } = pageChunks[i];
    const json = extractedJSONs[i] || {};

    const chapterNodeId = `sec_${start}_${i}`;
    const chapterNode = {
      id: chapterNodeId,
      title: json.chapterTitle || sectionTitle || `Part ${i + 1}`,
      level: 0,
      summary: json.summary || "",
      keyConcepts: json.keyConcepts || [],
      formulas: json.formulas || [],
      mcqs: json.mcqs || [],
      pageStart: cs,
      pageEnd: ce,
      children: [],
    };

    if (json.topics && Array.isArray(json.topics)) {
      json.topics.forEach((topic, tIdx) => {
        const topicNode = {
          id: `${chapterNodeId}_t${tIdx}`,
          title: topic.title || "Topic",
          level: 1,
          pageStart: cs,
          pageEnd: ce,
          children: [],
        };
        if (topic.subtopics && Array.isArray(topic.subtopics)) {
          topic.subtopics.forEach((sub, sIdx) => {
            topicNode.children.push({
              id: `${chapterNodeId}_t${tIdx}_s${sIdx}`,
              title: sub.title || "Subtopic",
              level: 2,
              summary: sub.details || "",
              pageStart: cs,
              pageEnd: ce,
              children: [],
            });
          });
        }
        chapterNode.children.push(topicNode);
      });
    }

    rootNodes.push(chapterNode);

    embeddableChunks.push({
      nodeId: chapterNodeId,
      text: chunkText,
      title: chapterNode.title,
      kind: "text",
      contentType: "explanation",
      pageStart: cs,
      pageEnd: ce,
    });
  }

  if (embed) {
    progress({ status: "embedding", progress: 90, message: "Generating vector embeddings..." });
    await embedChunks(embeddableChunks);
  }

  progress({ status: "done", progress: 100, message: "Section parsed." });
  logger.info("PIPELINE", `Section pages ${start}-${end}: ${embeddableChunks.length} chunks.`);

  return {
    outline: rootNodes.map(compactOutline),
    chunks: embeddableChunks,
    stats: { totalChunks: embeddableChunks.length, pages: end - start + 1 },
  };
}

/**
 * Splits text into chunks by a max character length, preferring paragraph boundaries.
 */
function chunkRawText(text, maxChars) {
  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    if (currentPos + maxChars >= text.length) {
      chunks.push(text.slice(currentPos));
      break;
    }
    
    // Try to find a paragraph break (\n\n) near the limit
    let splitPos = text.lastIndexOf("\n\n", currentPos + maxChars);
    if (splitPos <= currentPos) {
      // Fallback to sentence break or space
      splitPos = text.lastIndexOf(". ", currentPos + maxChars);
    }
    if (splitPos <= currentPos) {
      splitPos = text.lastIndexOf(" ", currentPos + maxChars);
    }
    if (splitPos <= currentPos) {
      splitPos = currentPos + maxChars; // hard split
    }

    chunks.push(text.slice(currentPos, splitPos).trim());
    currentPos = splitPos;
  }
  return chunks.filter(c => c.length > 50); // Filter out tiny empty chunks
}

export async function processBuffer(buffer, opts = {}) {
  const {
    fileName = "document.pdf",
    embed = true,
    adapters = {},
    progress = () => {},
  } = opts;

  const fileHash = sha256(buffer);
  progress({ status: "start", progress: 2, fileHash });

  if (typeof adapters.lookupByHash === "function") {
    const cached = await adapters.lookupByHash(fileHash);
    if (cached) {
      logger.info("PIPELINE", "Cache hit — reusing prior result.");
      return { ...cached, reused: true, fileHash };
    }
  }

  // 1. Extract raw text
  progress({ status: "extracting", progress: 10, message: "Extracting raw text from PDF..." });
  const pdfData = await pdfParse(buffer);
  const rawText = pdfData.text;

  // 2. Chunk text
  progress({ status: "chunking", progress: 20, message: "Chunking text for analysis..." });
  // Chunk into ~4000 characters (approx 1000 tokens)
  const textChunks = chunkRawText(rawText, 4000);

  // 3. LLM Structured Extraction
  progress({ status: "structuring", progress: 30, message: "Using LLM to extract document structure (this may take a few minutes)..." });
  const extractedJSONs = await processChunksConcurrently(textChunks);

  // 4. Build Tree
  progress({ status: "building_tree", progress: 80, message: "Assembling document tree..." });
  const rootNodes = [];
  const embeddableChunks = [];
  
  for (let i = 0; i < textChunks.length; i++) {
    const chunkText = textChunks[i];
    const json = extractedJSONs[i];
    
    // We treat each chunk as a Chapter (level 0)
    const chapterNodeId = `chunk_${i}`;
    const chapterNode = {
      id: chapterNodeId,
      title: json.chapterTitle || `Section ${i + 1}`,
      level: 0,
      summary: json.summary || "",
      keyConcepts: json.keyConcepts || [],
      formulas: json.formulas || [],
      mcqs: json.mcqs || [],
      children: []
    };

    // Subtopics
    if (json.topics && Array.isArray(json.topics)) {
      json.topics.forEach((topic, tIdx) => {
        const topicNode = {
          id: `${chapterNodeId}_t${tIdx}`,
          title: topic.title || "Topic",
          level: 1,
          children: []
        };
        
        if (topic.subtopics && Array.isArray(topic.subtopics)) {
          topic.subtopics.forEach((sub, sIdx) => {
            topicNode.children.push({
              id: `${chapterNodeId}_t${tIdx}_s${sIdx}`,
              title: sub.title || "Subtopic",
              level: 2,
              summary: sub.details || "",
              children: []
            });
          });
        }
        chapterNode.children.push(topicNode);
      });
    }

    rootNodes.push(chapterNode);

    // Also push to embeddable chunks for RAG
    embeddableChunks.push({
      nodeId: chapterNodeId, // Links it to the chapter node in MongoDB
      text: chunkText,
      title: chapterNode.title,
      kind: "text",
      contentType: "explanation",
      fileHash
    });
  }

  // 5. Embed
  if (embed) {
    progress({ status: "embedding", progress: 85, message: "Generating vector embeddings..." });
    await embedChunks(embeddableChunks);
  }

  const result = {
    success: true,
    reused: false,
    fileName,
    fileHash,
    pages: pdfData.numpages || 1,
    docType: "book",
    outline: rootNodes.map(compactOutline),
    chunks: embeddableChunks,
    stats: { totalChunks: embeddableChunks.length, pages: pdfData.numpages || 1, extractMethod: "pdf-parse+llm" },
    processedAt: new Date().toISOString(),
  };

  progress({ status: "saving", progress: 95, message: "Saving to database..." });
  if (typeof adapters.saveResult === "function") await adapters.saveResult(result);

  progress({ status: "done", progress: 100, message: "Complete!" });
  logger.info("PIPELINE", `Done: ${result.stats.totalChunks} chunks over ${result.pages} pages.`);
  return result;
}

export async function processFromFile(path, opts = {}) {
  const { readFile } = await import("fs/promises");
  const buffer = await readFile(path);
  return processBuffer(buffer, { fileName: path.split(/[\\/]/).pop(), ...opts });
}

export async function processFromS3(s3Key, opts = {}) {
  const { fetchPdfFromS3 } = await import("./s3.js");
  const buffer = await fetchPdfFromS3(s3Key, opts.bucket);
  return processBuffer(buffer, { fileName: opts.fileName || s3Key.split("/").pop(), ...opts });
}

export default { processBuffer, processFromFile, processFromS3 };
