# 📚 book-breaker

**Subject-agnostic, semantic + hierarchical PDF chunker for high-quality RAG.**

Give it any study PDF — History, Physics, Law, Medicine, Mathematics, a solved
question paper, class notes — and it reconstructs the book's *real* structure
instead of blindly splitting on token count:

```
Book
└── Chapter
    └── Topic
        └── Subtopic
            ├── explanation      ├── example      ├── definition
            ├── formula          ├── table        ├── diagram
            ├── mcq              ├── exercise     ├── summary
            └── previous_year_question ...
```

Every chunk is **one complete concept**, carries the **real source text** (never
a summary), and ships with rich metadata for retrieval.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Install](#install)
- [Environment variables](#environment-variables)
- [Quick start](#quick-start)
- [Programmatic use](#programmatic-use)
- [Output schema](#output-schema)
- [Pipeline stages](#pipeline-stages)
- [Configuration](#configuration)
- [Going fully local](#going-fully-local)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [Limitations & roadmap](#limitations--roadmap)

---

## Why this exists

Naive RAG splits a PDF into fixed 500-token windows. That breaks concepts in
half, loses the chapter/topic hierarchy, mangles two-column pages, drops tables
and figures, and stores no useful metadata. Retrieval quality suffers.

| Concern | Naive chunker | **book-breaker** |
|---|---|---|
| Chunk unit | fixed N tokens | one concept / section |
| Stored text | often a summary | **the real source text** |
| Structure | none (flat) | true nested hierarchy |
| Reading order | PDF render order | **column-aware** reading order |
| Tables / figures | flattened or dropped | preserved as typed chunks |
| Metadata | filename only | book, chapter, topic, subtopic, pages, content type, keywords, parent path |
| Scanned PDFs | fail / garbage | 300-DPI OCR fallback |
| Content types | none | definition / example / formula / table / diagram / mcq / exercise / pyq / summary / … |
| Books without questions | breaks expectations | adapts automatically |

---

## Architecture

```
                 ┌──────────────────────── Node.js orchestration ────────────────────────┐
   PDF ──▶ extractor.js ──▶ detect.js ──▶ headings.js ──▶ hierarchy.js ──▶ chunker.js ──▶ contentType.js ──▶ embeddings.js ──▶ chunks
                 │              │             │              │                │               │                  │
             python/        Groq LLM     font-size +     nest + attach    semantic       heuristics +        OpenAI
           extract.py     (type/book)    numbering       real text +      leaf packing   Groq (ambiguous)   embeddings
        (PyMuPDF, pdfplumber,             (no LLM)        pages + assets                                     (swappable)
         Tesseract OCR)
```

- **Node.js** drives the pipeline and all the "intelligence" glue.
- **Python** (PyMuPDF + pdfplumber, Tesseract as fallback) does the heavy,
  accuracy-critical layout extraction that JS libraries can't match.
- **Groq** `llama-3.3-70b-versatile` handles document-type detection, ambiguous
  content-type classification, and optional outline refinement.
- **OpenAI** `text-embedding-3-small` produces embeddings (swappable — see
  [Going fully local](#going-fully-local)).

---

## Requirements

- **Node.js** ≥ 18
- **Python** 3.9+ with:
  - `pymupdf` and `pdfplumber` (always)
  - `pytesseract` + `pillow` and the `tesseract-ocr` binary (only for scanned PDFs)
- A **Groq** API key (structure + classification)
- An **OpenAI** API key (embeddings)

---

## Install

```bash
# 1) Node deps
npm install

# 2) Python extraction deps
pip install pymupdf pdfplumber pytesseract pillow

# 3) OCR engine — only needed for scanned/image PDFs
#    Ubuntu/Debian:
sudo apt-get install tesseract-ocr
#    macOS:
brew install tesseract
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | yes | LLM reasoning (Groq) |
| `OPENAI_API_KEY` | yes* | Embeddings (*not needed if you switch to a local embedder) |
| `PYTHON_BIN` | no | Path to Python (default `python3`) |
| `OCR_LANG` | no | Tesseract language(s), e.g. `eng`, `eng+hin` (default `eng`) |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | no | Only for `processFromS3` |

```bash
export GROQ_API_KEY=gsk_...
export OPENAI_API_KEY=sk-...
```

---

## Quick start

```bash
node example.js path/to/book.pdf
```

Writes three files next to `example.js`:

- `book.outline.json` — the reconstructed hierarchy (titles, levels, page ranges)
- `book.chunks.json` — RAG-ready chunks with full metadata (embeddings stripped for readability)
- `book.embeddings.json` — `{ id, embedding }` pairs

Console prints a summary like:

```json
{
  "totalChunks": 214,
  "pages": 38,
  "extractMethod": "pymupdf",
  "extractQuality": 1.0,
  "byType": { "explanation": 90, "example": 31, "mcq": 22, "definition": 18, "summary": 6, "table": 5, "diagram": 4 },
  "byKind": { "text": 205, "table": 5, "figure": 4 }
}
```

---

## Programmatic use

```js
import { processBuffer, processFromFile, processFromS3 } from "./src/pipeline.js";

// From a local file
const result = await processFromFile("physics.pdf");

// From a Buffer (e.g. an upload)
const result = await processBuffer(pdfBuffer, {
  fileName: "physics.pdf",
  refineOutline: true,      // bounded LLM pass to tidy chapter/topic nesting
  useLlmContentType: true,  // LLM resolves only the ambiguous content types
  embed: true,              // set false to skip embeddings while iterating
  progress: (e) => console.log(e.status, e.progress + "%"),
  adapters: {               // optional caching / persistence hooks
    lookupByHash: async (hash) => db.get(hash),
    saveResult:   async (res)  => db.put(res.fileHash, res),
  },
});

// From S3
const result = await processFromS3("uploads/physics.pdf", { bucket: "my-bucket" });
```

Results are **content-hashed** — re-processing the same PDF hits `lookupByHash`
and skips all work.

---

## Output schema

### `result`

```jsonc
{
  "success": true,
  "reused": false,
  "fileName": "physics.pdf",
  "fileHash": "sha256…",
  "pages": 38,
  "docType": "book",
  "bookMeta": { "recognized": true, "book_name": "…", "class": "…", "subject": "Physics", "board_or_exam": "CBSE", "confidence": 0.82 },
  "outline": [ /* nested nodes: id, title, level, pageStart, pageEnd, tables, figures, children */ ],
  "chunks": [ /* see below */ ],
  "stats": { /* totals + byType + byKind */ },
  "processedAt": "2026-…Z"
}
```

### `result.chunks[i]`

```jsonc
{
  "id": "c42",
  "nodeId": "n17",
  "kind": "text",                       // "text" | "table" | "figure"
  "contentType": "definition",          // definition | explanation | example | formula |
                                        // table | diagram | mcq | exercise |
                                        // previous_year_question | summary |
                                        // important_points | notes | question | procedure
  "contentTypeConfidence": 0.9,
  "bookName": "NCERT Physics",
  "part": "",
  "chapter": "Chapter 1 Laws of Motion",
  "topic": "1.1 Introduction",
  "subtopic": "",
  "path": ["Chapter 1 Laws of Motion", "1.1 Introduction"],
  "parentPath": "Chapter 1 Laws of Motion",
  "pageStart": 1,
  "pageEnd": 2,
  "keywords": ["motion", "force", "inertia"],
  "docType": "book",
  "subject": "Physics",
  "class": "",
  "text": "…the real source text of this concept…",
  "embedText": "NCERT Physics > Chapter 1 … \n\n…text…",   // breadcrumb-prefixed for contextual retrieval
  "embedding": [0.01, -0.02, …]          // 1536-d (text-embedding-3-small)
}
```

Load `chunks` into any vector store (pgvector, Pinecone, Qdrant, Chroma…):
embed the query, cosine-rank against `embedding`, and use `path` / `parentPath`
to pull surrounding context for the LLM answer.

---

## Pipeline stages

| # | File | Uses LLM? | Does |
|---|---|---|---|
| 1 | `python/extract.py` (via `src/extractor.js`) | no | Per-line text + font stats + bbox, column detection, de-hyphenation, header/footer removal, tables, figures, OCR escalation, quality score |
| 2 | `src/detect.js` | Groq | Document type + known-book metadata |
| 3 | `src/headings.js` | no | Heading detection from font-size tiers + numbering |
| 4 | `src/hierarchy.js` | Groq (optional) | Nest sections, attach real text + pages + tables/figures |
| 5 | `src/chunker.js` | no | Semantic paragraph/sentence packing; tables/figures → own chunks |
| 6 | `src/contentType.js` | Groq (ambiguous only) | Tag each chunk's content type |
| 7 | `src/embeddings.js` | OpenAI | Batched embeddings |

Deterministic stages (3, 5) do the structural heavy lifting with **no** LLM, so
they're fast, free, and reproducible. The LLM is used surgically.

---

## Configuration

Everything tunable lives in `src/config.js`. Common knobs:

```js
chunk: {
  targetChars: 1400,   // ~350 tokens per chunk — retrieval granularity
  maxChars: 2200,      // hard ceiling before a forced split
  minChars: 200,       // merge tiny orphan chunks upward
  overlapChars: 180,   // overlap only WITHIN an oversized leaf
  contextualPrefix: true,
},
headings: {
  sizeRatioThreshold: 1.12,  // font-size multiple that flags a heading
  maxHeadingLevels: 6,
},
extract: {
  minWordsPerPage: 12,       // below this ⇒ suspect scan ⇒ try OCR
},
```

---

## Going fully local

The embedding backend is swappable:

1. In `src/embeddings.js`, implement `localEmbed(inputs)` using
   [transformers.js](https://github.com/huggingface/transformers.js) (e.g.
   `bge-small-en`) or an Ollama embed model (`nomic-embed-text`).
2. Set `CONFIG.embeddings.provider = "local"` in `src/config.js`.

To swap the reasoning LLM (Groq → Ollama/OpenAI), replace `src/llm.js` — the
rest of the pipeline is provider-agnostic.

---

## Project layout

```
book-breaker/
├── package.json
├── README.md
├── example.js                 # CLI entry point
├── python/
│   └── extract.py             # PyMuPDF + pdfplumber + OCR layout extractor
└── src/
    ├── config.js              # all tunables
    ├── logger.js
    ├── utils.js               # retry, JSON repair, hashing, concurrency
    ├── llm.js                 # Groq wrapper (text + JSON w/ repair)
    ├── embeddings.js          # OpenAI (swappable)
    ├── s3.js                  # optional S3 fetch
    ├── extractor.js           # drives extract.py, OCR escalation, quality gate
    ├── detect.js              # doc type + known-book detection
    ├── headings.js            # deterministic heading detection
    ├── hierarchy.js           # tree assembly + optional LLM refine
    ├── chunker.js             # semantic leaf chunking
    ├── contentType.js         # content-type classification
    └── keywords.js            # lightweight keyword extraction
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `python failed: … ModuleNotFoundError` | `pip install pymupdf pdfplumber pytesseract pillow` |
| Extraction falls back to OCR and is slow | The PDF is scanned. Ensure `tesseract-ocr` is installed; set `OCR_LANG`. |
| "extraction produced too little text" | Corrupt/empty/password-protected PDF. |
| Garbled two-column text | Should be handled; if not, lower `headings.sizeRatioThreshold` or file a sample. |
| `GROQ_API_KEY not set` warning | Export the key before running. |
| Chunks too big/small for your vector DB | Tune `CONFIG.chunk.targetChars` / `maxChars`. |
| Flat hierarchy (no chapters) | The PDF likely has no font-size variation (pure OCR). Enable `refineOutline`. |

Run with `LOG_LEVEL=debug` for a full trace.

---

## Limitations & roadmap

- **Formulas** are detected and preserved as text/`formula` chunks, but not yet
  converted to LaTeX. Add a math-OCR step (e.g. `pix2tex`) in `python/extract.py`.
- **Borderless tables** may fall back to plain text (pdfplumber relies on ruled lines).
- **Retrieval side** (query API + eval harness) is not included yet — the output
  is designed to drop straight into your existing vector store.

Planned: hierarchy-aware retrieval helper, gold-set evaluation harness, and an
optional local embedding backend out of the box.
