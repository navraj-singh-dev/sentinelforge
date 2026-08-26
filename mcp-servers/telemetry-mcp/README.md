# SentinelForge: Telemetry MCP Server

A Model Context Protocol (MCP) server providing operational incident alerting, telemetry metrics, and high-volume application log streams to TrueForge autonomous SRE agents.

## Architecture & Telemetry Provider Configuration

The server decouples MCP transport endpoints from backend telemetry systems via the `ITelemetryProvider` interface:

1. **`HttpTelemetryProvider` (Live Operational Mode):**
   * Configured via `TELEMETRY_ENDPOINT` (e.g. `https://telemetry.internal.infra.net` or Prometheus/OTel gateway) and optional `TELEMETRY_API_KEY`.
   * Sends HTTP queries to `/api/v1/alerts/active`, `/api/v1/logs/query`, and `/api/v1/metrics/timeseries`.
   * Returns explicit `isError: true` tool error responses with diagnostic context if upstream endpoints are unreachable or return HTTP 4xx/5xx errors.

2. **`FileFixtureTelemetryProvider` (Incident Simulation / Demo Mode):**
   * Default fallback when `TELEMETRY_ENDPOINT` is not configured, or explicitly loaded from `INCIDENT_PAYLOAD_PATH`.
   * Loads structured incident definitions from `mock-infra/incident_payloads/alert_timeout_spike.json` and emits realistic 504 Gateway Timeout logs and latency metrics matching the payment microservice regression.

## Tools Exposed

| Tool Name | Parameters | Constraints | Description |
|---|---|---|---|
| `get_active_alerts` | `service_name` (optional) | `min(1)` | Retrieves active P1/P2 operational alerts from the active provider. |
| `fetch_service_logs` | `service_name`, `window_minutes`, `log_level` | `window_minutes: [1..1440]` | Streams structured JSON logs and stack traces (>10KB payload). |
| `get_metric_timeseries` | `metric_name`, `window_minutes` | `window_minutes: [1..1440]` | Retrieves time-series metric points (error rates, P99 latencies). |

## Installation & Build
From the repository root, install dependencies and compile the TypeScript source:

```bash
cd mcp-servers/telemetry-mcp
npm install
npm run build
```

## Running Verification Tests
Execute the integration test suite enforcing hard assertions:

```bash
npm test
```

## TrueForge Integration
In your TrueForge agent configuration (`agents/sentinel_root.json`), add this connector:

```json
{
  "name": "telemetry-mcp",
  "command": "node",
  "args": ["mcp-servers/telemetry-mcp/dist/index.js"],
  "env": {
    "INCIDENT_PAYLOAD_PATH": "mock-infra/incident_payloads/alert_timeout_spike.json"
  }
}
```
