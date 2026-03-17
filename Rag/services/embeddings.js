import OpenAI from 'openai';

let openaiClient = null;

function getOpenAI() {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key') {
    return null;
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Generate an embedding vector for a piece of text
 * @param {string} text
 * @returns {Promise<number[]>} 1536-dimensional vector
 */
export async function getEmbedding(text) {
  const client = getOpenAI();
  if (!client) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
  }

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' ').slice(0, 8000),
  });

  return response.data[0].embedding;
}

/**
 * Split text into overlapping chunks
 * @param {string} text
 * @param {number} chunkSize - characters per chunk
 * @param {number} overlap - overlapping characters
 * @returns {string[]}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured() {
  return getOpenAI() !== null;
}
