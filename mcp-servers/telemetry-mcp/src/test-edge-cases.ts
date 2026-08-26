import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "index.js");

async function verifyEdgeCases() {
  console.log("Running comprehensive isolated edge-case verification...");

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "edge-case-tester", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // Test Case A: 5-minute window logs (verifies no future timestamps)
  const res5 = await client.callTool({
    name: "fetch_service_logs",
    arguments: { service_name: "checkout-payment-api", window_minutes: 5 },
  });
  const data5 = JSON.parse((res5.content as Array<{ type: string; text: string }>)[0].text);
  const now = Date.now();
  const oldest5 = new Date(data5.logs[0].timestamp).getTime();
  const newest5 = new Date(data5.logs[59].timestamp).getTime();
  assert.ok(oldest5 >= now - 6 * 60 * 1000, "5-min window: oldest log must be within last 6 minutes");
  assert.ok(newest5 <= now + 1000, "5-min window: newest log must NOT be in future");
  console.log("✓ Edge Case A PASSED: 5-minute window timestamps are strictly bounded.");

  // Test Case B: 60-minute window logs (verifies full span without clipping)
  const res60 = await client.callTool({
    name: "fetch_service_logs",
    arguments: { service_name: "checkout-payment-api", window_minutes: 60 },
  });
  const data60 = JSON.parse((res60.content as Array<{ type: string; text: string }>)[0].text);
  const oldest60 = new Date(data60.logs[0].timestamp).getTime();
  const newest60 = new Date(data60.logs[59].timestamp).getTime();
  assert.ok(oldest60 <= now - 50 * 60 * 1000, "60-min window: oldest log must reach back ~50-60 mins");
  assert.ok(newest60 <= now + 1000, "60-min window: newest log must NOT be in future");
  console.log("✓ Edge Case B PASSED: 60-minute window covers the entire hour span.");

  // Test Case C: Absolute deployment boundary in metrics
  // Deployment was 25 mins ago. In a 60-minute query, points from 30+ mins ago should have normal error rate (<1%), while points from last 20 mins should have spiked error rate (>50%).
  const metricRes60 = await client.callTool({
    name: "get_metric_timeseries",
    arguments: { metric_name: "error_rate", window_minutes: 60 },
  });
  const metricData60 = JSON.parse((metricRes60.content as Array<{ type: string; text: string }>)[0].text);
  const deployTime = now - 25 * 60 * 1000;
  for (const pt of metricData60.points) {
    const ptTime = new Date(pt.timestamp).getTime();
    if (ptTime < deployTime) {
      assert.ok(pt.value < 1.0, `Pre-deploy point at ${pt.timestamp} must be normal (<1.0%), got ${pt.value}`);
    } else {
      assert.ok(pt.value > 50.0, `Post-deploy point at ${pt.timestamp} must be degraded (>50.0%), got ${pt.value}`);
    }
  }
  console.log("✓ Edge Case C PASSED: Metric error rate degradation aligns to absolute deployment time.");

  await client.close();
  console.log("\nALL EDGE-CASE TESTS VALIDATED WITH ZERO REGRESSIONS.");
}

verifyEdgeCases().catch((err) => {
  console.error("EDGE CASE FAILURE:", err);
  process.exit(1);
});
