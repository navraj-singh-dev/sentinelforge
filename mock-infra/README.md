# Mock Target Infrastructure: Payment Microservice

This directory contains the target service used to simulate production incidents and demonstrate SentinelForge's autonomous diagnosis and sandbox validation capabilities.

## Structure
* `src/payment_service.py`: Simulates the payment processing microservice.
* `src/test_payment.py`: Pytest suite testing checkout flows and database latency resilience.
* `incident_payloads/alert_timeout_spike.json`: Sample P1 alert payload sent to the TrueForge agent.

## Prerequisites & Installation
* **Python Requirement:** Python 3.10 or newer (required for `@dataclass(slots=True)` support).

Install the Python dependencies from the repository root using the target Python interpreter:
```bash
python -m pip install -r requirements.txt
```

## How to Reproduce the Incident
From the repository root, execute pytest:
```bash
python -m pytest mock-infra/src/test_payment.py
```

### Expected Output (Buggy State):
The test `test_checkout_database_timeout_resilience` fails with:
```
AssertionError: Checkout failed with status 504: 504 Gateway Timeout: Database query exceeded configured timeout of 2.0s. Database timeout was configured to 2.0s.
```

### Verified Patch:
When SentinelForge updates `PaymentConfig.db_timeout_seconds = 30.0` inside the Daytona sandbox, all 3 tests pass with `100% success`.
