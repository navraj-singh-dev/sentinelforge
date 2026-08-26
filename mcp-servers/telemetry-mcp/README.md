# SentinelForge: Telemetry MCP Server

A Model Context Protocol (MCP) server providing real-time operational incident alerting, telemetry metric queries, and high-volume application log streams.

## Tools Exposed

| Tool Name | Parameters | Description |
|---|---|---|
| `get_active_alerts` | `service_name` (optional) | Retrieves active P1/P2 operational alerts and deployment metadata. |
| `fetch_service_logs` | `service_name`, `window_minutes`, `log_level` | Streams structured JSON logs and stack traces (>10KB payload). |
| `get_metric_timeseries` | `metric_name`, `window_minutes` | Retrieves time-series metric points (error rates, P99 latencies). |

## Installation & Build
From the repository root, install dependencies and compile the TypeScript source:

```bash
cd mcp-servers/telemetry-mcp
npm install
npm run build
```

## Running the Server
The server communicates over standard I/O (`stdio`):

```bash
node dist/index.js
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
