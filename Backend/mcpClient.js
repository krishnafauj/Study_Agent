import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["../my-mcp-server/server.js"]   // relative path
});

export const mcpClient = new Client(
  {
    name: "express-client",
    version: "1.0.0"
  },
  {
    capabilities: {}
  }
);

// connect when file loads
await mcpClient.connect(transport);

console.log("✅ Connected to MCP server");
