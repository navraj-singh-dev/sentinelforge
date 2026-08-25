# SentinelForge: System Architecture & Design

## 1. Overview
SentinelForge is an autonomous Incident Response and Remediation Agent engineered on the **TrueForge Agent Harness**. When an alert fires, SentinelForge isolates root causes, recreates regression failures inside an isolated Daytona sandbox, synthesizes a verified hotfix, and halts at a human approval checkpoint before executing any repository or infrastructure mutations.

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

## 2. Key Architecture Components

### A. TrueForge Harness Loop
* **Context Protection:** High-volume telemetry logs are written directly to sandbox storage (`sandbox://logs/dump.json`) with only compact summaries returned to LLM context.
* **Subagents:** Dynamic subagents (`telemetry_triage`, `git_bisect`) run in clean token windows, returning concise JSON reports.
* **Approval Gates:** Write tools (`create_pull_request`, `post_slack_update`) enforce an interactive halt requiring operator approval.

### B. Daytona Sandbox Isolation
* All code execution, test runs (`pytest`), and patch testing happen inside an ephemeral sandbox container. Host files and production databases are never touched directly by the model.

### C. Qodo Continuous Code Review
* Every codebase branch is reviewed via Qodo PR integration, ensuring zero unreviewed code merges.
