#!/usr/bin/env node

/**
 * SentinelForge: Telemetry MCP Server
 * Exposes Model Context Protocol (MCP) tools for incident triage, log inspection, and metric evaluation.
 * Supports configurable live HTTP/REST telemetry backends (Prometheus/OTel) with file-backed fixture fallback.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Domain Interfaces & Types
// ============================================================================

export interface ActiveAlert {
  incident_id: string;
  service: string;
  severity: "P1-CRITICAL" | "P2-HIGH" | "P3-MEDIUM" | "P4-LOW";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  triggered_at: string;
  title: string;
  summary: string;
  metrics: {
    error_rate_percentage: number;
    p99_latency_ms: number;
    p50_latency_ms: number;
    active_connection_pool_saturation: number;
  };
  deployment_context: {
    recent_commit_hash: string;
    author: string;
    deployed_at: string;
    branch: string;
  };
  affected_endpoints: string[];
}

export interface StructuredLogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  trace_id: string;
  service: string;
  endpoint: string;
  status_code: number;
  duration_ms: number;
  message: string;
  stack_trace?: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  unit: string;
}

/**
 * Provider interface decoupling telemetry acquisition from the MCP transport layer.
 */
export interface ITelemetryProvider {
  readonly providerName: string;
  getActiveAlerts(serviceName?: string): Promise<ActiveAlert[]>;
  getServiceLogs(
    serviceName: string,
    windowMinutes: number,
    logLevel: "ALL" | "INFO" | "WARN" | "ERROR"
  ): Promise<StructuredLogEntry[]>;
  getMetricTimeseries(
    metricName: "error_rate" | "latency_p99" | "db_connection_saturation",
    windowMinutes: number
  ): Promise<MetricDataPoint[]>;
}

// ============================================================================
// Live HTTP Provider (Datadog / Prometheus / OTel REST API Adapter)
// ============================================================================

export class HttpTelemetryProvider implements ITelemetryProvider {
  public readonly providerName = "HttpTelemetryProvider";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string
  ) {}

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "SentinelForge-Telemetry-MCP/1.0",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} from telemetry provider`);
      }
      return (await response.json()) as T;
    } catch (error) {
      throw new Error(
        `Failed to reach upstream telemetry service at ${this.baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async getActiveAlerts(serviceName?: string): Promise<ActiveAlert[]> {
    const params: Record<string, string> = serviceName ? { service: serviceName } : {};
    return this.request<ActiveAlert[]>("/api/v1/alerts/active", params);
  }

  async getServiceLogs(
    serviceName: string,
    windowMinutes: number,
    logLevel: "ALL" | "INFO" | "WARN" | "ERROR"
  ): Promise<StructuredLogEntry[]> {
    return this.request<StructuredLogEntry[]>("/api/v1/logs/query", {
      service: serviceName,
      window: String(windowMinutes),
      level: logLevel,
    });
  }

  async getMetricTimeseries(
    metricName: "error_rate" | "latency_p99" | "db_connection_saturation",
    windowMinutes: number
  ): Promise<MetricDataPoint[]> {
    return this.request<MetricDataPoint[]>("/api/v1/metrics/timeseries", {
      metric: metricName,
      window: String(windowMinutes),
    });
  }
}

// ============================================================================
// File-Backed Fixture Provider (Incident Reproduction Mode)
// ============================================================================

export class FileFixtureTelemetryProvider implements ITelemetryProvider {
  public readonly providerName = "FileFixtureTelemetryProvider";
  private readonly incidentDeploymentOffsetMs = 25 * 60 * 1000;
  private readonly incidentTriggerOffsetMs = 18 * 60 * 1000;
  private cachedPayload: any = null;

  constructor(private readonly fixtureFilePath?: string) {}

  private loadFixture(): any {
    if (this.cachedPayload) return this.cachedPayload;

    const defaultPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../mock-infra/incident_payloads/alert_timeout_spike.json"
    );
    const targetPath = this.fixtureFilePath || process.env.INCIDENT_PAYLOAD_PATH || defaultPath;

    if (fs.existsSync(targetPath)) {
      try {
        this.cachedPayload = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
        return this.cachedPayload;
      } catch (e) {
        // Fallback to internal payload if file corrupt
      }
    }

    this.cachedPayload = {
      incident_id: "INC-84920",
      service: "checkout-payment-api",
      severity: "P1-CRITICAL",
      title: "High 504 Gateway Timeout Rate on /api/v1/checkout",
      summary: "Payment checkout success rate dropped following deployment 4c21.",
      metrics: {
        error_rate_percentage: 68.4,
        p99_latency_ms: 2850,
        p50_latency_ms: 320,
        active_connection_pool_saturation: 94.2,
      },
      affected_endpoints: ["/api/v1/checkout", "/api/v1/payment/process"],
    };
    return this.cachedPayload;
  }

  async getActiveAlerts(serviceName?: string): Promise<ActiveAlert[]> {
    const raw = this.loadFixture();
    const now = Date.now();

    const alert: ActiveAlert = {
      incident_id: raw.incident_id || "INC-84920",
      service: raw.service || "checkout-payment-api",
      severity: raw.severity || "P1-CRITICAL",
      status: "ACTIVE",
      triggered_at: new Date(now - this.incidentTriggerOffsetMs).toISOString(),
      title: raw.title || "High 504 Gateway Timeout Rate on /api/v1/checkout",
      summary: raw.summary || "Database lock timeouts causing checkout failures.",
      metrics: {
        error_rate_percentage: raw.metrics?.error_rate_percentage ?? 68.4,
        p99_latency_ms: raw.metrics?.p99_latency_ms ?? 2850,
        p50_latency_ms: raw.metrics?.p50_latency_ms ?? 320,
        active_connection_pool_saturation: raw.metrics?.active_connection_pool_saturation ?? 94.2,
      },
      deployment_context: {
        recent_commit_hash: "4c21",
        author: "developer@sentinelforge.local",
        deployed_at: new Date(now - this.incidentDeploymentOffsetMs).toISOString(),
        branch: "main",
      },
      affected_endpoints: raw.affected_endpoints || ["/api/v1/checkout"],
    };

    if (serviceName && alert.service.toLowerCase() !== serviceName.toLowerCase()) {
      return [];
    }
    return [alert];
  }

  async getServiceLogs(
    serviceName: string,
    windowMinutes: number,
    logLevel: "ALL" | "INFO" | "WARN" | "ERROR"
  ): Promise<StructuredLogEntry[]> {
    const now = Date.now();
    const startTimeMs = now - windowMinutes * 60 * 1000;
    const deployTimestampMs = now - this.incidentDeploymentOffsetMs;
    const totalLogCount = 60;
    const intervalMs = (windowMinutes * 60 * 1000) / totalLogCount;

    const logs: StructuredLogEntry[] = [];

    for (let i = 0; i < totalLogCount; i++) {
      const entryTimeMs = startTimeMs + i * intervalMs;
      const entryIso = new Date(entryTimeMs).toISOString();
      const traceId = `trc_${Math.random().toString(36).substring(2, 11)}`;
      const isPostDeployment = entryTimeMs >= deployTimestampMs;
      const isError = isPostDeployment && i % 2 === 0;

      if (isError) {
        logs.push({
          timestamp: entryIso,
          level: "ERROR",
          trace_id: traceId,
          service: serviceName,
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
          timestamp: entryIso,
          level: "INFO",
          trace_id: traceId,
          service: serviceName,
          endpoint: "/api/v1/checkout",
          status_code: 200,
          duration_ms: 120 + Math.floor(Math.random() * 80),
          message: `Payment transaction committed successfully: tx_${traceId}`,
        });
      }
    }

    if (logLevel === "ALL") return logs;
    return logs.filter((l) => l.level === logLevel);
  }

  async getMetricTimeseries(
    metricName: "error_rate" | "latency_p99" | "db_connection_saturation",
    windowMinutes: number
  ): Promise<MetricDataPoint[]> {
    const now = Date.now();
    const startTimeMs = now - windowMinutes * 60 * 1000;
    const deployTimestampMs = now - this.incidentDeploymentOffsetMs;
    const totalPoints = 12;
    const intervalMs = (windowMinutes * 60 * 1000) / (totalPoints - 1);

    const points: MetricDataPoint[] = [];

    for (let i = 0; i < totalPoints; i++) {
      const pointTimeMs = startTimeMs + i * intervalMs;
      const pointIso = new Date(pointTimeMs).toISOString();
      const isPostDeployment = pointTimeMs >= deployTimestampMs;

      let value = 0;
      let unit = "";

      if (metricName === "error_rate") {
        unit = "percentage";
        value = isPostDeployment ? 68.4 + (Math.random() * 3 - 1.5) : 0.2 + Math.random() * 0.1;
      } else if (metricName === "latency_p99") {
        unit = "milliseconds";
        value = isPostDeployment ? 2850 + (Math.random() * 150 - 75) : 340 + Math.random() * 30;
      } else {
        unit = "percentage";
        value = isPostDeployment ? 94.2 + (Math.random() * 2 - 1) : 22.0 + Math.random() * 4;
      }

      points.push({
        timestamp: pointIso,
        value: Number(value.toFixed(2)),
        unit,
      });
    }

    return points;
  }
}

// ============================================================================
// Factory & Server Construction
// ============================================================================

export function resolveTelemetryProvider(): ITelemetryProvider {
  const endpoint = process.env.TELEMETRY_ENDPOINT || process.env.PROMETHEUS_ENDPOINT;
  if (endpoint) {
    const apiKey = process.env.TELEMETRY_API_KEY;
    return new HttpTelemetryProvider(endpoint, apiKey);
  }
  return new FileFixtureTelemetryProvider(process.env.INCIDENT_PAYLOAD_PATH);
}

export function createTelemetryMcpServer(
  provider: ITelemetryProvider = resolveTelemetryProvider()
): McpServer {
  const server = new McpServer({
    name: "telemetry-mcp",
    version: "1.0.0",
  });

  /**
   * Tool 1: get_active_alerts
   */
  server.tool(
    "get_active_alerts",
    "Retrieves active P1/P2 operational alerts from the configured telemetry provider (HTTP backend or incident fixture).",
    {
      service_name: z
        .string()
        .min(1)
        .optional()
        .describe("Optional service name filter (e.g. 'checkout-payment-api')"),
    },
    async ({ service_name }) => {
      try {
        const alerts = await provider.getActiveAlerts(service_name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  provider: provider.providerName,
                  total_active_alerts: alerts.length,
                  retrieved_at: new Date().toISOString(),
                  alerts,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Telemetry provider error [${provider.providerName}]: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 2: fetch_service_logs
   */
  server.tool(
    "fetch_service_logs",
    "Streams structured application and error logs (>10KB) for a service across a strictly bounded lookback window.",
    {
      service_name: z
        .string()
        .min(1)
        .describe("Target service name (e.g. 'checkout-payment-api')"),
      window_minutes: z
        .number()
        .int()
        .positive()
        .min(1)
        .max(1440)
        .default(15)
        .describe("Time lookback window in minutes (1 to 1440, default: 15)"),
      log_level: z
        .enum(["ALL", "ERROR", "WARN", "INFO"])
        .default("ALL")
        .describe("Log level filter (default: ALL)"),
    },
    async ({ service_name, window_minutes, log_level }) => {
      try {
        const logs = await provider.getServiceLogs(service_name, window_minutes, log_level);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  provider: provider.providerName,
                  service: service_name,
                  window_minutes,
                  total_records: logs.length,
                  retrieved_at: new Date().toISOString(),
                  logs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Telemetry provider error [${provider.providerName}]: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 3: get_metric_timeseries
   */
  server.tool(
    "get_metric_timeseries",
    "Retrieves time-series metric datapoints across a strictly bounded lookback window with absolute event alignment.",
    {
      metric_name: z
        .enum(["error_rate", "latency_p99", "db_connection_saturation"])
        .describe("Name of the metric timeseries to query"),
      window_minutes: z
        .number()
        .int()
        .positive()
        .min(1)
        .max(1440)
        .default(30)
        .describe("Lookback window in minutes (1 to 1440, default: 30)"),
    },
    async ({ metric_name, window_minutes }) => {
      try {
        const points = await provider.getMetricTimeseries(metric_name, window_minutes);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  provider: provider.providerName,
                  metric: metric_name,
                  window_minutes,
                  datapoints_count: points.length,
                  retrieved_at: new Date().toISOString(),
                  points,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Telemetry provider error [${provider.providerName}]: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          ],
        };
      }
    }
  );

  return server;
}

// Start stdio transport when executed as the main script
async function main() {
  const server = createTelemetryMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.env.NODE_ENV !== "test"
) {
  main().catch((error) => {
    console.error("Fatal error starting Telemetry MCP Server:", error);
    process.exit(1);
  });
}
