---
name: incident-triage
description: "Step-by-step progressive disclosure triage playbook for active production incidents. Guides alert ingestion, metric correlation, log extraction, and root-cause diagnosis."
---

# Progressive Disclosure Incident Triage Playbook

Use this playbook whenever an active incident alert is ingested or a production service experiences degraded error rates or latency spikes.

## Phase 1: Alert Ingestion & Scope Determination
1. Call `get_active_alerts` via the `telemetry-mcp` server.
2. Identify:
   * **Incident ID:** Unique incident reference (e.g., `INC-84920`).
   * **Target Service:** Impacted microservice name (`checkout-payment-api`).
   * **Severity:** Incident priority level (`P1-CRITICAL`).
   * **Reported Symptoms:** Error rate spike percentage and p99 latency degradation.
   * **Recent Deployment Context:** Recent deployment commit hash (e.g., `4c21`).

## Phase 2: Delegated Telemetry Triage (Subagent)
Delegate high-volume log and metric inspection to the `telemetry_triage` subagent:
1. Invoke `fetch_service_logs` with `window_minutes=15` and `log_level="ERROR"`.
2. Extract the exact stack traces and error messages (e.g. `Database query exceeded configured timeout of 2.0s`).
3. Query `get_metric_timeseries` for `error_rate` and `latency_p99` to confirm exact onset time relative to deployment.

## Phase 3: Delegated Git Regression Analysis (Subagent)
Delegate commit diff inspection to the `git_bisect` subagent:
1. Inspect commit history around the reported deployment hash (`4c21`).
2. Compare diffs in the affected microservice files (`mock-infra/src/payment_service.py`).
3. Identify the faulty configuration change (e.g. `db_timeout_seconds` changed from `30.0` to `2.0`).

## Phase 4: Incident Diagnosis Summary
Synthesize a structured diagnosis containing:
* **Root Cause:** Explanation of why queries are timing out.
* **Blast Radius:** Affected endpoints (`/api/v1/checkout`).
* **Faulty Commit:** Commit hash, author, and exact line change.
* **Proposed Remediation:** Reverting `db_timeout_seconds` back to `30.0`.
