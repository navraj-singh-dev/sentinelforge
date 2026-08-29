import http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createTelemetryMcpServer } from "./index.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 8080;
const REQUIRED_API_KEY = process.env.MCP_API_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8790,http://127.0.0.1:8790,http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

// Multi-client session registry (Remediates Qodo Finding 1: Concurrent sessions)
const activeTransports = new Map<string, SSEServerTransport>();

function validateAuth(req: http.IncomingMessage): boolean {
  if (!REQUIRED_API_KEY) return true;
  const authHeader = req.headers["authorization"] || "";
  return authHeader === `Bearer ${REQUIRED_API_KEY}`;
}

function handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers["origin"] as string | undefined;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

export function createSseHttpServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (handleCors(req, res)) return;

    const url = new URL(req.url || "", `http://${req.headers.host || HOST}`);

    // Health / Discovery endpoint
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          name: "telemetry-mcp",
          status: "running",
          transport: "sse",
          sse_endpoint: "/sse",
          active_sessions: activeTransports.size,
        })
      );
    }

    // Authentication check for MCP endpoints (Remediates Qodo Finding 2)
    if (!validateAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized: Missing or invalid API key" }));
    }

    // SSE Connect Endpoint
    if (url.pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      transport.onclose = () => {
        activeTransports.delete(sessionId);
      };

      const mcpServer = createTelemetryMcpServer();
      await mcpServer.connect(transport);
      return;
    }

    // Message Delivery Endpoint (Routes to specific session by sessionId)
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      const transport = sessionId ? activeTransports.get(sessionId) : activeTransports.values().next().value;

      if (!transport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Session not found or expired" }));
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  return server;
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`);

if (isDirectExecution || process.env.NODE_ENV !== "test") {
  const server = createSseHttpServer();
  server.listen(PORT, HOST, () => {
    console.log(`📡 Telemetry MCP Server (SSE) listening on http://${HOST}:${PORT}/sse`);
  });
}
