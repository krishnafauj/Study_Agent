import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

console.log("🚀 MCP Server starting...");

// Create MCP Server
const server = new Server(
  {
    name: "my-first-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {

  console.log("📦 tools/list requested");

  return {
    tools: [
      {
        name: "sayHello",
        description: "Simple hello tool",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" }
          },
          required: ["name"]
        }
      }
    ]
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {

  console.log("🔥 Tool called:", request.params);

  if (request.params.name === "sayHello") {

    const name = request.params.arguments.name;

    return {
      content: [
        {
          type: "text",
          text: `Hello ${name} from MCP server 🚀`
        }
      ]
    };
  }

  throw new Error("Tool not found");
});

// Start MCP server
const transport = new StdioServerTransport();

await server.connect(transport);

console.log("✅ MCP Server ready (stdio mode)");
