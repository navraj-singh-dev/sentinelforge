#!/usr/bin/env node

/**
 * SentinelForge Telemetry MCP Server
 * Exposes tools for operational incident alerting, telemetry timeseries metrics, and high-volume log streams.
 * Compatible with TrueForge MCP runtime and Claude / Antigravity MCP tooling.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize standard MCP Server instance
const server = new McpServer({
  name: "telemetry-mcp",
  version: "1.0.0",
});

/**
 * Tool 1: get_active_alerts
 * Retrieves active production incidents and alert thresholds.
 */
server.tool(
  "get_active_alerts",
  "Fetches currently active P1/P2/P3 production alerts across registered microservices.",
  {
    service_name: z
      .string()
      .optional()
      .describe("Optional service name filter (e.g., 'checkout-payment-api')"),
  },
  async ({ service_name }) => {
    const alerts = [
      {
        incident_id: "INC-84920",
        service: "checkout-payment-api",
        severity: "P1-CRITICAL",
        status: "ACTIVE",
        triggered_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        title: "High 504 Gateway Timeout Rate on /api/v1/checkout",
        summary:
          "Payment checkout success rate dropped to 31.6% following deployment 4c21. Transactions with database queries taking >2.0s are aborting with connection pool timeout.",
        metrics: {
          error_rate_percentage: 68.4,
          p99_latency_ms: 2850,
          p50_latency_ms: 320,
          active_connection_pool_saturation: 94.2,
        },
        deployment_context: {
          recent_commit_hash: "4c21",
          author: "developer@sentinelforge.local",
          deployed_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          branch: "main",
        },
        affected_endpoints: ["/api/v1/checkout", "/api/v1/payment/process"],
      },
    ];

    const filtered = service_name
      ? alerts.filter((a) => a.service.toLowerCase() === service_name.toLowerCase())
      : alerts;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total_active_alerts: filtered.length,
              timestamp: new Date().toISOString(),
              alerts: filtered,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Tool 2: fetch_service_logs
 * Streams structured JSON logs for a given service.
 * Emits high-volume output (>10KB) demonstrating TrueForge's Large Result Offloading into the sandbox.
 */
server.tool(
  "fetch_service_logs",
  "Fetches detailed application and error logs for a specific service over a time window.",
  {
    service_name: z.string().describe("Target service name (e.g. 'checkout-payment-api')"),
    window_minutes: z
      .number()
      .default(15)
      .describe("Time window in minutes to inspect (default: 15)"),
    log_level: z
      .enum(["ALL", "ERROR", "WARN", "INFO"])
      .default("ALL")
      .describe("Log level filter (default: ALL)"),
  },
  async ({ service_name, window_minutes, log_level }) => {
    const logs: Array<{
      timestamp: string;
      level: string;
      trace_id: string;
      service: string;
      endpoint: string;
      status_code: number;
      duration_ms: number;
      message: string;
      stack_trace?: string;
    }> = [];

    const now = Date.now();
    const startTime = now - window_minutes * 60 * 1000;

    // Generate 60 realistic high-fidelity log entries
    for (let i = 0; i < 60; i++) {
      const entryTime = new Date(startTime + i * 15 * 1000).toISOString();
      const traceId = `trc_${Math.random().toString(36).substring(2, 11)}`;
      const isError = i % 2 === 0; // High failure rate (50%) matching the 68% error spike

      if (isError) {
        logs.push({
          timestamp: entryTime,
          level: "ERROR",
          trace_id: traceId,
          service: service_name,
          endpoint: "/api/v1/checkout",
          status_code: 504,
          duration_ms: 2000 + Math.floor(Math.random() * 850),
          message:
            "Checkout failed: 504 Gateway Timeout: Database query exceeded configured timeout of 2.0s",
          stack_trace: `Traceback (most recent call last):
  File "payment_service.py", line 102, in process_checkout
    db_result = self.db_pool.execute_transaction(query, estimated_latency_seconds)
  File "payment_service.py", line 63, in execute_transaction
    raise TimeoutError(f"Database query exceeded configured timeout of {self.timeout_seconds}s")
TimeoutError: Database query exceeded configured timeout of 2.0s`,
        });
      } else {
        logs.push({
          timestamp: entryTime,
          level: "INFO",
          trace_id: traceId,
          service: service_name,
          endpoint: "/api/v1/checkout",
          status_code: 200,
          duration_ms: 120 + Math.floor(Math.random() * 80),
          message: "Payment transaction committed successfully: tx_" + traceId,
        });
      }
    }

    const filteredLogs =
      log_level === "ALL" ? logs : logs.filter((l) => l.level === log_level);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              service: service_name,
              window_minutes,
              total_records: filteredLogs.length,
              retrieved_at: new Date().toISOString(),
              logs: filteredLogs,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Tool 3: get_metric_timeseries
 * Returns timeseries metric points for telemetry dashboards and anomaly detection.
 */
server.tool(
  "get_metric_timeseries",
  "Fetches metric timeseries datapoints (error rate %, P99 latency ms, active connections).",
  {
    metric_name: z
      .enum(["error_rate", "latency_p99", "db_connection_saturation"])
      .describe("Name of the metric timeseries to query"),
    window_minutes: z
      .number()
      .default(30)
      .describe("Lookback window in minutes (default: 30)"),
  },
  async ({ metric_name, window_minutes }) => {
    const points: Array<{ timestamp: string; value: number; unit: string }> = [];
    const now = Date.now();
    const intervalMs = (window_minutes * 60 * 1000) / 10;

    for (let i = 10; i >= 0; i--) {
      const pointTime = new Date(now - i * intervalMs).toISOString();
      const isAfterDeploy = i <= 6; // Deployment occurred 18 mins ago (points 0..6 are in degraded state)

      let val = 0;
      let unit = "";

      if (metric_name === "error_rate") {
        unit = "percentage";
        val = isAfterDeploy ? 68.4 + (Math.random() * 4 - 2) : 0.2 + (Math.random() * 0.1);
      } else if (metric_name === "latency_p99") {
        unit = "milliseconds";
        val = isAfterDeploy ? 2850 + (Math.random() * 200 - 100) : 340 + (Math.random() * 30);
      } else {
        unit = "percentage";
        val = isAfterDeploy ? 94.2 + (Math.random() * 3 - 1.5) : 22.0 + (Math.random() * 5);
      }

      points.push({
        timestamp: pointTime,
        value: Number(val.toFixed(2)),
        unit,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              metric: metric_name,
              window_minutes,
              datapoints_count: points.length,
              points,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start the stdio transport server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting Telemetry MCP Server:", error);
  process.exit(1);
});
