import OpenAI from "openai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Get embedding for text using OpenAI
 */
export async function getEmbedding(text) {
  try {
    const response = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " ").slice(0, 8000),
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error("Embedding error:", err);
    return [];
  }
}

/**
 * Extract text from PDF stored in S3
 */
export async function extractTextFromS3PDF(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    const pdfBuffer = await response.Body.transformToByteArray();

    // For MVP, we'll extract text using a simple approach
    // In production, use pdf-parse or similar library
    // For now, return mock extracted text structure
    return extractTextFromBuffer(pdfBuffer);
  } catch (err) {
    console.error("S3 PDF extraction error:", err);
    throw new Error(`Failed to extract PDF from S3: ${err.message}`);
  }
}

/**
 * Simple PDF text extraction
 * Note: This is a simplified version. Use pdf-parse for production
 */
function extractTextFromBuffer(buffer) {
  // Placeholder: In production, use pdf-parse library
  // This would parse the PDF and return structured text
  const text = buffer.toString("utf8", 0, Math.min(50000, buffer.length));
  return {
    fullText: text,
    pages: [{ pageNumber: 1, content: text }],
    totalPages: 1,
  };
}

/**
 * Analyze text and extract hierarchical structure
 * Uses Claude/GPT to identify topics, subtopics, etc.
 */
export async function analyzeHierarchicalStructure(text) {
  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing documents and extracting hierarchical topic structures.
          
          Analyze the provided text and extract a hierarchical structure with:
          - Main Topics (Level 0)
          - Subtopics (Level 1) under each main topic
          - Sub-subtopics (Level 2) if they exist
          
          Return a JSON array with this structure:
          [
            {
              "title": "Topic Title",
              "level": 0,
              "content": "Brief summary of this topic",
              "children": [
                {
                  "title": "Subtopic",
                  "level": 1,
                  "content": "Summary",
                  "children": []
                }
              ]
            }
          ]
          
          Keep summaries concise (1-2 sentences). Extract max 5 main topics.`,
        },
        {
          role: "user",
          content: `Analyze this document and extract the hierarchical structure:\n\n${text.slice(0, 8000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (err) {
    console.error("Hierarchy analysis error:", err);
    return [];
  }
}

/**
 * Flatten hierarchical topics into a list for database insertion
 */
export async function flattenTopics(topics, parentId = null, level = 0, order = 0) {
  const flattened = [];
  let currentOrder = 0;

  for (const topic of topics) {
    const topicData = {
      title: topic.title,
      level,
      parentTopicId: parentId,
      content: topic.content || "",
      summary: topic.content || "",
      order: currentOrder,
      children: [],
    };

    // Get embedding for this topic
    try {
      topicData.embedding = await getEmbedding(`${topic.title} ${topic.content}`);
    } catch (err) {
      console.error("Failed to get embedding:", err);
      topicData.embedding = [];
    }

    flattened.push(topicData);

    // Process children
    if (topic.children && topic.children.length > 0) {
      const childResults = await flattenTopics(
        topic.children,
        null, // will be set after parent is created
        level + 1,
        0
      );
      topicData.children = childResults;
    }

    currentOrder++;
  }

  return flattened;
}

/**
 * Process PDF and create hierarchical topic structure
 * Returns progress updates via callback
 */
export async function processPDFHierarchy(s3Key, fileName, fileId, userId, progressCallback) {
  try {
    // Step 1: Extract text from PDF
    progressCallback({ status: "extracting", progress: 2, message: "Extracting text from PDF..." });
    const pdfData = await extractTextFromS3PDF(s3Key);

    // Step 2: Analyze structure
    progressCallback({ status: "analyzing", progress: 4, message: "Analyzing document structure..." });
    const hierarchicalTopics = await analyzeHierarchicalStructure(pdfData.fullText);

    // Step 3: Flatten and embed
    progressCallback({ status: "embedding", progress: 6, message: "Creating embeddings..." });
    const flattenedTopics = await flattenTopics(hierarchicalTopics, null, 0, 0);

    progressCallback({ status: "embedding", progress: 8, message: "Finalizing..." });

    return {
      topics: flattenedTopics,
      totalTopics: flattenedTopics.length,
      totalPages: pdfData.totalPages,
      success: true,
    };
  } catch (err) {
    console.error("PDF processing error:", err);
    throw err;
  }
}
