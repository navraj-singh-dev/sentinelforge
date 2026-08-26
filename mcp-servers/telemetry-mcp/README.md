# SentinelForge: Telemetry MCP Server

A Model Context Protocol (MCP) server providing operational incident alerting, telemetry metrics, and high-volume application log streams to TrueForge autonomous SRE agents.

## Architecture & Provider Abstraction
The telemetry server cleanly decouples transport serialization from data acquisition via the `ITelemetryProvider` interface.

* **`MockIncidentTelemetryProvider` (Default / Demo Mode):** An incident reproduction adapter that emits realistic P1 checkout timeout incidents, 504 log traces, and error rate spikes aligned with the git regression in `mock-infra`.
* **Extensibility:** Easily swappable with production telemetry backends (Datadog, Prometheus, CloudWatch, OpenTelemetry) by implementing `ITelemetryProvider`.

## Tools Exposed

| Tool Name | Parameters | Constraints | Description |
|---|---|---|---|
| `get_active_alerts` | `service_name` (optional) | `min(1)` | Retrieves active P1/P2 operational alerts and deployment metadata. |
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
Execute the end-to-end integration assertions against the compiled server:

```bash
npm test
```

## TrueForge Integration
In your TrueForge agent configuration (`agents/sentinel_root.json`), add this connector:

```json
{
  "name": "telemetry-mcp",
  "command": "node",
  "args": ["mcp-servers/telemetry-mcp/dist/index.js"]
}
```
