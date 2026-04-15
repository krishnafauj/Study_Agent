import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { tools } from "./tool.js"; // ✅ correct filename

const server = new Server(
  {
    name: "study-agent-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── List available tools ────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema,
    })),
  };
});

// ─── Handle tool calls ───────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.invoke(args);
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Tool error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Start MCP server ────────────────────────────────────────────────────────
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Study Agent MCP server started"); // stderr so it doesn't pollute stdio JSON
}

start();