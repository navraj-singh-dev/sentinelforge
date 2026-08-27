# SentinelForge: System Architecture & Technical Design

SentinelForge is an autonomous Incident Response and Remediation Agent engineered on the **TrueForge Agent Harness**. When an operational alert fires, SentinelForge isolates root causes across telemetry streams and Git histories using delegated subagents, recreates regression failures inside an isolated Daytona sandbox, synthesizes a verified hotfix, and halts at a human approval checkpoint before executing any repository or infrastructure mutations.

```
                    +--------------------------------+
                    |    Incident Alert Received     |
                    +---------------+----------------+
                                    |
                                    v
                    +--------------------------------+
                    |    SentinelForge Root Agent    |
                    |   (TrueForge Orchestrator)     |
                    +---------------+----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-------------------------+                     +-------------------------+
| Telemetry Subagent      |                     | Git Bisect Subagent     |
| - Queries error metrics |                     | - Inspects git commits  |
| - Streams server logs   |                     | - Pinpoints breaking PR |
+-----------+-------------+                     +-----------+-------------+
            |                                               |
            +-----------------------+-----------------------+
                                    |
                                    v
                    +--------------------------------+
                    |    Daytona Sandbox Engine      |
                    | - Clones repo at commit        |
                    | - Recreates failing test       |
                    | - Generates & tests patch      |
                    +---------------+----------------+
                                    |
                                    v
                    +--------------------------------+
                    | Human Approval Checkpoint      |
                    | - Generative UI diff card      |
                    | - Pauses for explicit sign-off |
                    +---------------+----------------+
                                    |
                                    v
                    +--------------------------------+
                    | Remediation Pull Request       |
                    | - Opened on GitHub             |
                    | - Reviewed by Qodo bot         |
                    +--------------------------------+
```

---

## 1. Key Architectural Components

### A. TrueForge Harness Orchestrator (`agents/sentinel_root.json`)
* **Multi-Agent Coordination:** The root incident commander maintains a lean context window, delegating heavy diagnostic workloads to specialized subagents.
* **Context Protection & Large Result Offload:** High-volume telemetry logs (>10 KB) are automatically offloaded to sandbox storage (`sandbox://logs/dump.json`), with only structured diagnostic summaries returned to the root agent.
* **Human Approval Gates:** Destructive tools (`create_pull_request`, `deploy_hotfix`, `post_slack_update`) enforce an interactive halt requiring human operator sign-off in the TrueForge interface.
* **Model Provider Flexibility:** Primary model configured for Google Gemini 2.0 Flash with local Ollama (`http://localhost:11434/v1`) fallback support.

### B. Specialist Subagents
1. **Telemetry Triage Subagent (`agents/telemetry_triage.json`):**
   * Connects to `telemetry-mcp` to query `fetch_service_logs` and `get_metric_timeseries`.
   * Filters raw JSON log streams, isolates HTTP 504 status codes, and extracts stack traces (`Database query exceeded configured timeout of 2.0s`).
2. **Git Bisect Subagent (`agents/git_bisect.json`):**
   * Inspects repository commit logs around recent deployments (commit `4c21`).
   * Correlates error signatures with code diffs to isolate the faulty configuration change in `payment_service.py`.

### C. Model Context Protocol (MCP) Server (`mcp-servers/telemetry-mcp`)
Exposes three standardized SRE tools via stdio transport:
* `get_active_alerts`: Ingests active P1/P2 production alerts with metric metadata and deployment commit context.
* `fetch_service_logs`: Streams structured JSON log records with dynamically scaled timestamps spanning the lookback window.
* `get_metric_timeseries`: Returns timeseries data points demonstrating error rate and p99 latency degradation aligned to absolute deployment epoch timestamps.
* **Dual Telemetry Provider Architecture:** Implements `ITelemetryProvider` interface supporting live `HttpTelemetryProvider` backends and deterministic `FileFixtureTelemetryProvider` modes.

### D. Custom Agent Skills & Playbooks (`skills/` and `.agents/skills/`)
* **`skills/incident-triage/SKILL.md`:** 4-phase progressive disclosure playbook guiding alert ingestion, metric verification, log extraction, and root-cause synthesis.
* **`skills/hotfix-generator/SKILL.md`:** 4-phase remediation playbook guiding sandbox reproduction (`pytest`), minimal surgical patch synthesis, acceptance test verification, and approval requests.
* **`.agents/skills/qodo-pr-resolver/SKILL.md`:** End-to-end automated PR review resolution skill for fetching, resolving, and replying to Qodo code review findings.

### E. Daytona Sandbox Isolation
* All code execution, failure reproduction, and patch validation happen inside an isolated container running `python -m pytest`.
* Host environments and production databases are protected from direct model modifications.

---

## 2. End-to-End Incident Lifecycle

```
[Production Alert INC-84920 Ingested]
               │
               ▼
[Phase 1: Alert Ingestion & Scope Analysis]
  - Root agent queries get_active_alerts via telemetry-mcp.
  - Identifies target service (checkout-payment-api), severity (P1), and recent deployment (4c21).
               │
               ▼
[Phase 2: Delegated Telemetry Triage]
  - telemetry_triage subagent fetches error logs and timeseries metrics.
  - Extracts root error: Database lock timeout exceeded 2.0s on /api/v1/checkout.
               │
               ▼
[Phase 3: Delegated Git Regression Analysis]
  - git_bisect subagent checks commit 4c21 diff.
  - Confirms db_timeout_seconds was reduced from 30.0s to 2.0s.
               │
               ▼
[Phase 4: Isolated Sandbox Reproduction & Hotfix Generation]
  - Root agent reproduces failure in Daytona sandbox via pytest (504 Gateway Timeout).
  - Synthesizes minimal fix restoring db_timeout_seconds = 30.0.
  - Re-runs pytest: 100% tests pass (3 passed in 0.20s).
               │
               ▼
[Phase 5: Human Approval State Machine Pause]
  - TrueForge halts at approval_required: true on create_pull_request.
  - Operator reviews proposed diff and clicks "Approve".
               │
               ▼
[Phase 6: Automated PR Creation & Qodo Code Review]
  - Pull request opened on GitHub.
  - Qodo bot reviews PR, confirms 0 bugs, and marks all items ✓ Resolved.
  - Human merges hotfix into production.
```

---

## 3. Security & Safety Invariants

1. **Zero Unapproved Mutations:** No code is pushed to production or main branches without explicit human sign-off.
2. **Context Isolation:** Raw log floods cannot overwhelm root orchestrator reasoning.
3. **Deterministic Sandbox Verification:** Patches must pass 100% of unit and regression tests prior to being presented for approval.
4. **Mandatory Qodo Audit Trail:** All repository changes are reviewed via pull requests by Qodo to maintain code quality.
