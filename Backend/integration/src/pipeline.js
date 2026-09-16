import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
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
    keyConcepts: node.keyConcepts || [],
    formulas: node.formulas || [],
    mcqs: node.mcqs || [],
    children: kids,
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
