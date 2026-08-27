---
name: hotfix-generator
description: "Step-by-step remediation playbook for synthesizing verified code patches inside isolated sandboxes, running acceptance tests, and requesting operator approval."
---

# Autonomous Hotfix Synthesis & Verification Playbook

Use this playbook to safely generate, test, and propose remediations for diagnosed incidents.

## Phase 1: Isolated Sandbox Reproduction
1. Execute the existing regression test suite inside the isolated sandbox environment:
   ```bash
   python -m pytest mock-infra/src/test_payment.py
   ```
2. Verify that the test deterministically fails with the expected error:
   ```
   AssertionError: Checkout failed with status 504: 504 Gateway Timeout: Database query exceeded configured timeout of 2.0s
   ```

## Phase 2: Minimal Patch Synthesis
1. Open the target source file (`mock-infra/src/payment_service.py`).
2. Apply the minimal surgical fix restoring the safe configuration:
   ```python
   # Remediate database connection pool timeout from degraded 2.0s to production 30.0s
   db_timeout_seconds: float = 30.0
   ```
3. Ensure no unrelated lines or configurations are altered.

## Phase 3: Acceptance Test Verification
1. Re-run the regression test suite inside the sandbox:
   ```bash
   python -m pytest mock-infra/src/test_payment.py
   ```
2. Confirm that all 3 tests pass cleanly (100% green test suite):
   ```
   mock-infra/src/test_payment.py ... [100%]
   3 passed in 0.20s
   ```

## Phase 4: Human-in-the-Loop Approval Request
1. Format a clear diff summary for the human operator showing:
   * Tested file diff.
   * Pytest before-and-after results.
   * Target branch (`fix/incident-INC-84920-db-timeout`).
2. Trigger the TrueForge approval gate for `create_pull_request`.
3. Halt execution and wait for human operator approval before creating the PR or deploying.
