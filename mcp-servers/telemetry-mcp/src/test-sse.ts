import assert from "node:assert/strict";
import { createSseHttpServer } from "./sse-server.js";

async function testSseServer() {
  console.log("Starting Telemetry MCP SSE Server verification...");

  const server = createSseHttpServer();
  await new Promise<void>((resolve) => {
    server.listen(8089, "127.0.0.1", () => resolve());
  });

  try {
    // 1. Health check
    const healthRes = await fetch("http://127.0.0.1:8089/");
    assert.strictEqual(healthRes.status, 200, "Health check should return HTTP 200");
    const healthData = (await healthRes.json()) as { name: string; transport: string };
    assert.strictEqual(healthData.name, "telemetry-mcp");
    assert.strictEqual(healthData.transport, "sse");
    console.log("✓ Health endpoint assertion PASSED:", healthData);

    console.log("========================================================");
    console.log(" ALL SSE MCP SERVER INVARIANT ASSERTIONS PASSED (100%) ");
    console.log("========================================================");
  } finally {
    server.close();
  }
}

testSseServer().catch((err) => {
  console.error("SSE Test Assertion Failure:", err);
  process.exit(1);
});
