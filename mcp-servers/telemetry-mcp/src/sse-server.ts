import http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createTelemetryMcpServer } from "./index.js";

const PORT = 8080;
let transport: SSEServerTransport | null = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  // Health / Root check
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ name: "telemetry-mcp", status: "running", transport: "sse", sse_endpoint: "/sse" }));
  }

  // SSE Connect Endpoint
  if (url.pathname === "/sse" && req.method === "GET") {
    console.log("[telemetry-mcp] New client connecting via SSE transport...");
    transport = new SSEServerTransport("/messages", res);
    const mcpServer = createTelemetryMcpServer();
    await mcpServer.connect(transport);
    return;
  }

  // Message Endpoint
  if (url.pathname === "/messages" && req.method === "POST") {
    if (!transport) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "No active SSE transport connection" }));
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`📡 Telemetry MCP Server (SSE) running at http://127.0.0.1:${PORT}/sse`);
});
