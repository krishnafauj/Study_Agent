import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// ─── Helper: internal backend call (no auth needed — MCP server is trusted) ───
async function backendGet(path) {
  const res = await axios.get(`${BACKEND_URL}/api/internal${path}`, {
    headers: { "x-mcp-secret": process.env.MCP_SECRET || "mcp-internal-secret" }
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1: get_folder_context
// Returns all topics + performance marks for a given folder so the AI can
// understand what subject area the student is studying.
// ─────────────────────────────────────────────────────────────────────────────
export const getFolderContextTool = {
  name: "get_folder_context",
  description:
    "Fetch all topics and their performance marks/scores for a given file or folder. " +
    "Use this to understand what subjects are available in this study session " +
    "and to build the topic-scoped system prompt.",
  schema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The file ID to fetch context for (primary key)"
      },
      folderId: {
        type: "string",
        description: "The folder ID (treated as fileId if fileId not provided)"
      }
    },
    required: []
  },
  async invoke({ fileId, folderId }) {
    try {
      const id = fileId || folderId;
      if (!id) return JSON.stringify({ error: "fileId or folderId required" });
      const data = await backendGet(`/folder-context/${id}`);
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2: get_weak_topics
// Returns topics where the student has low performance (<70%) so the AI can
// proactively suggest revision areas.
// ─────────────────────────────────────────────────────────────────────────────
export const getWeakTopicsTool = {
  name: "get_weak_topics",
  description:
    "Fetch topics where the student has weak performance (score < 70%) or hasn't attempted yet. " +
    "Use this to proactively suggest areas the student should focus on.",
  schema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The file ID to check weak topics for (primary key)"
      },
      folderId: {
        type: "string",
        description: "The folder ID (treated as fileId if fileId not provided)"
      },
      threshold: {
        type: "number",
        description: "Performance threshold below which a topic is considered weak (default: 70)"
      }
    },
    required: []
  },
  async invoke({ fileId, folderId, threshold = 70 }) {
    try {
      const id = fileId || folderId;
      if (!id) return JSON.stringify({ error: "fileId or folderId required" });
      const data = await backendGet(`/weak-topics/${id}?threshold=${threshold}`);
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3: get_rag_context
// Fetches the most relevant topic chunks from the user's documents using
// vector similarity so the AI can ground its answers in actual study material.
// ─────────────────────────────────────────────────────────────────────────────
export const getRagContextTool = {
  name: "get_rag_context",
  description:
    "Retrieve the most relevant content chunks from the student's study documents " +
    "using semantic search. Always call this before answering subject questions " +
    "to ground the response in actual material.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The user's question or message to search for relevant content"
      },
      fileId: {
        type: "string",
        description: "The file ID to search within (optional — searches all files if omitted)"
      },
      folderId: {
        type: "string",
        description: "The folder ID to scope the search (optional)"
      },
      limit: {
        type: "number",
        description: "Max number of chunks to return (default: 5)"
      }
    },
    required: ["query"]
  },
  async invoke({ query, fileId, folderId, limit = 5 }) {
    try {
      const params = new URLSearchParams({ query, limit });
      if (fileId) params.set("fileId", fileId);
      if (folderId) params.set("folderId", folderId);
      const data = await backendGet(`/rag-context?${params}`);
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
};

export const tools = [
  getFolderContextTool,
  getWeakTopicsTool,
  getRagContextTool
];