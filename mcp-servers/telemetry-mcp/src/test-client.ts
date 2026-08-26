import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "index.js");

async function run() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to Telemetry MCP Server successfully!");

  // List tools
  const tools = await client.listTools();
  console.log("Discovered Tools:", tools.tools.map((t) => t.name));

  // Call get_active_alerts
  const alertsRes = await client.callTool({
    name: "get_active_alerts",
    arguments: {},
  });
  console.log("\n--- get_active_alerts Result ---");
  const alertsContent = alertsRes.content as Array<{ type: string; text: string }>;
  console.log(alertsContent[0]?.text);

  // Call get_metric_timeseries
  const metricsRes = await client.callTool({
    name: "get_metric_timeseries",
    arguments: { metric_name: "error_rate", window_minutes: 15 },
  });
  console.log("\n--- get_metric_timeseries Result ---");
  const metricsContent = metricsRes.content as Array<{ type: string; text: string }>;
  console.log(metricsContent[0]?.text);

  // Call fetch_service_logs
  const logsRes = await client.callTool({
    name: "fetch_service_logs",
    arguments: { service_name: "checkout-payment-api", window_minutes: 15 },
  });
  const logsContent = logsRes.content as Array<{ type: string; text: string }>;
  const logsText = logsContent[0]?.text || "";
  console.log("\n--- fetch_service_logs Result ---");
  console.log(`Payload size: ${(logsText.length / 1024).toFixed(2)} KB`);
  console.log(`Contains 504 Timeout: ${logsText.includes("504 Gateway Timeout")}`);

  await client.close();
  console.log("\nAll MCP tool verification tests PASSED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
