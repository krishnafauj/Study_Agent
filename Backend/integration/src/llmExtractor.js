import { llmJson } from "./llm.js";
import { logger } from "./logger.js";
import { mapLimit } from "./utils.js";
import { CONFIG } from "./config.js";

const EXTRACTOR_PROMPT = `You are an expert textbook parser and structured document synthesizer.
Given the following chunk of text from a book or document, extract the core concepts and output them strictly in JSON format.

The JSON MUST match this exact schema:
{
  "chapterTitle": "The title of the chapter or main topic this chunk covers (if apparent, else a short descriptive title)",
  "summary": "A concise 2-4 sentence summary of the chunk's content",
  "topics": [
    {
      "title": "Topic Name",
      "subtopics": [
        {
          "title": "Subtopic Name",
          "details": "Brief bullet points or description of this subtopic"
        }
      ]
    }
  ],
  "keyConcepts": [
    {
      "concept": "Concept Name",
      "definition": "Definition or explanation"
    }
  ],
  "formulas": [
    {
      "name": "Formula Name",
      "expression": "The mathematical or logical expression",
      "explanation": "What the formula calculates or means"
    }
  ],
  "mcqs": [
    {
      "question": "A multiple choice question based on the text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "The exact string of the correct option",
      "explanation": "Why this answer is correct"
    }
  ]
}

- If there are no formulas, return an empty array for "formulas".
- Generate at least 2-3 MCQs if the text contains enough factual information.
- Output ONLY minified JSON, no markdown code blocks, no intro, no outro.`;

/**
 * Sends a raw text chunk to the LLM to generate a structured JSON document syllabus.
 */
export async function extractStructureFromChunk(textChunk, index, total) {
  logger.info("LLM_EXTRACT", `Processing chunk ${index + 1}/${total} (${textChunk.length} chars)`);
  
  const fallback = {
    chapterTitle: `Section ${index + 1}`,
    summary: "Could not extract summary due to parsing failure.",
    topics: [],
    keyConcepts: [],
    formulas: [],
    mcqs: []
  };

  try {
    const result = await llmJson(EXTRACTOR_PROMPT, textChunk, { label: "STRUCTURE_EXTRACT", fallback });
    return result;
  } catch (error) {
    logger.error("LLM_EXTRACT", `Failed to extract structure for chunk ${index + 1}: ${error.message}`);
    return fallback;
  }
}

/**
 * Takes an array of raw text chunks and processes them in parallel (with concurrency limit).
 */
export async function processChunksConcurrently(chunks) {
  return mapLimit(chunks, CONFIG.llm.concurrency, async (chunkText, index) => {
    return extractStructureFromChunk(chunkText, index, chunks.length);
  });
}
