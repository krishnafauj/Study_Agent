import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

// Mongo connect (your existing file)
import connectDB from "./models/MongoConnect.js";

// Your routes
import apiRoutes from "./Route/Route.js";

// MCP client imports
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const app = express();

console.log("🚀 Express starting...");

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

const transport = new StdioClientTransport({
  command: "node",
  args: ["../my-mcp-server/server.js"]
});

const mcpClient = new Client(
  {
    name: "express-client",
    version: "1.0.0"
  },
  {
    capabilities: {}
  }
);

await mcpClient.connect(transport);

console.log("✅ Connected to MCP server");

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down MCP connection...");
  await mcpClient.close();
  process.exit(0);
});
// ===============================
// TEST ROUTE
// ===============================

app.get("/test", async (req, res) => {

  try {

    const result = await mcpClient.request({
      method: "tools/call",
      params: {
        name: "sayHello",
        arguments: {
          name: "Krishna"
        }
      }
    });

    res.json(result);

  } catch (err) {

    console.error("MCP error:", err);

    res.status(500).json({ error: "MCP failed" });
  }
});


const PORT = process.env.PORT || 4000;

async function startServer() {

  try {

    await connectDB();

    console.log("MongoDB connected");

    app.listen(PORT, () => {

      console.log(`Server running on port ${PORT}`);

    });

  } catch (err) {

    console.error("Startup error:", err);

  }
}

startServer();
