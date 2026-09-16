// ─────────────────────────────────────────────
// Central configuration. Everything tunable lives here.
// ─────────────────────────────────────────────
export const CONFIG = {
  // ── Models ─────────────────────────────────
  llm: {
    provider: "groq",
    // Groq retired llama-3.1-8b-instant; gpt-oss-20b is its drop-in replacement
    // (131K context, tool calling + JSON mode). Use openai/gpt-oss-120b for more
    // intelligence when answer quality matters more than latency/cost.
    model: "openai/gpt-oss-20b",
    temperature: 0,
    maxTokens: 4000,
    // Groq requests/min are generous but finite — cap concurrency.
    concurrency: 2,
  },
  embeddings: {
    provider: "openai",              // "openai" | "local" (swap in embeddings.js)
    model: "text-embedding-3-small",
    dimensions: 1536,
    batchSize: 96,
    maxCharsPerInput: 8000,          // ~2k tokens; well under the 8191 token cap
  },

  // ── Python extraction ──────────────────────
  python: {
    bin: process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3"),
    timeoutMs: 8 * 60 * 1000,        // 8 min (OCR of a big book is slow)
    maxBuffer: 256 * 1024 * 1024,    // 256 MB stdout
  },

  // ── Extraction quality gates ───────────────
  extract: {
    minWordsPerPage: 12,             // below this avg ⇒ suspect scanned/bad extract
    minTotalWords: 40,
    // A page is treated as "empty text" (image page) below this many chars.
    emptyPageCharThreshold: 40,
  },

  // ── Heading detection ──────────────────────
  headings: {
    // A line is a heading candidate if its font size is at least this
    // multiple of the body font size, OR it is bold + short + title-like.
    sizeRatioThreshold: 1.12,
    maxHeadingWords: 18,             // headings are short
    maxHeadingLevels: 6,             // Book>Part>Chapter>Topic>Subtopic>Sub-sub
  },

  // ── Leaf chunking ──────────────────────────
  chunk: {
    targetChars: 1400,               // ~350 tokens — good retrieval granularity
    maxChars: 2200,                  // hard ceiling before forced split
    minChars: 200,                   // merge tiny orphan leaves upward
    overlapChars: 180,               // small overlap only *within* an oversized leaf
    // Prefix each embedded chunk with its breadcrumb for contextual retrieval.
    contextualPrefix: true,
  },

  // ── Detection sample sizes ─────────────────
  detect: {
    docTypeChars: 6000,
    bookMetaChars: 5000,
  },

  // ── Retry / robustness ─────────────────────
  retry: {
    attempts: 4,
    baseDelayMs: 600,
    maxDelayMs: 8000,
  },

  // ── LlamaParse ─────────────────────────────
  llamaParse: {
    apiKey: process.env.LLAMAPARSE_API_KEY || "llx-HkE613dYjueSkOnyJgIGG1wBUURYLTCYd0FiJattLmHiix4t",
    apiUrl: "https://api.cloud.llamaindex.ai/api/parsing",
    pollIntervalMs: 2000,
    maxPollAttempts: 150, // 5 minutes max wait
  },
};

export default CONFIG;
