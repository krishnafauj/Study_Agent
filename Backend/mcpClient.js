import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Lazy singleton ───────────────────────────────────────────────────────────
let _client = null;
let _connecting = null;

export async function getMcpClient() {
  if (_client) return _client;

  // Prevent multiple simultaneous connect() calls
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.resolve(__dirname, "../mcp/mcp-server.js")],
      env: {
        ...process.env,
        // Forward the internal secret so MCP tools can call backend
        MCP_SECRET: process.env.MCP_SECRET || "mcp-internal-secret",
        BACKEND_URL: `http://localhost:${process.env.PORT || 4000}`
      }
    });

    const client = new Client(
      { name: "study-agent-backend", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    console.log("✅ Connected to Study Agent MCP server");

    _client = client;

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("🔌 Closing MCP connection...");
      await client.close();
      process.exit(0);
    });

    return client;
  })();

  return _connecting;
}

// ─── Helper: call a tool by name ─────────────────────────────────────────────
export async function callMcpTool(toolName, args) {
  const client = await getMcpClient();
  const result = await client.callTool({ name: toolName, arguments: args });
  const text = result.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
