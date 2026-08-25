"""
Automated Test Suite for Payment Microservice
Tests normal checkout operations, input validation, and database load resilience.
"""

import pytest
from payment_service import PaymentProcessor, PaymentRequest, PaymentConfig


def test_standard_checkout_success() -> None:
    """Verifies that standard low-latency checkouts succeed."""
    processor = PaymentProcessor()
    request = PaymentRequest(
        order_id="ord_test_001",
        user_id="usr_123",
        amount_cents=4999,
        currency="USD",
    )
    response = processor.process_checkout(request, db_latency_seconds=0.2)
    assert response.success is True
    assert response.status_code == 200
    assert response.transaction_id is not None
    assert response.transaction_id.startswith("tx_ord_test_001")


def test_zero_amount_validation_failure() -> None:
    """Verifies that invalid amounts return a 400 Bad Request."""
    processor = PaymentProcessor()
    request = PaymentRequest(
        order_id="ord_test_invalid",
        user_id="usr_123",
        amount_cents=0,
    )
    response = processor.process_checkout(request)
    assert response.success is False
    assert response.status_code == 400
    assert "Invalid payment amount" in (response.error_message or "")


def test_checkout_database_timeout_resilience() -> None:
    """
    REGRESSION TEST:
    Verifies that checkout operations survive realistic database latencies (e.g. 2.5s under load).
    
    EXPECTED BEHAVIOR:
    When db_timeout_seconds is configured properly (30.0s), the service handles the load and returns 200 OK.
    
    FAILURE TRIGGER:
    If db_timeout_seconds is degraded to 2.0s (as in commit 4c21), this test throws AssertionError: 504 != 200.
    """
    # Uses default PaymentConfig
    processor = PaymentProcessor()
    
    request = PaymentRequest(
        order_id="ord_heavy_load_999",
        user_id="usr_load_test",
        amount_cents=12950,
        currency="USD",
    )
    
    # Simulate realistic peak database transaction duration (2.5 seconds)
    response = processor.process_checkout(request, db_latency_seconds=2.5)
    
    # Assert that the service completed the checkout successfully without a gateway timeout
    assert response.status_code == 200, (
        f"Checkout failed with status {response.status_code}: {response.error_message}. "
        f"Database timeout was configured to {processor.config.db_timeout_seconds}s."
    )
    assert response.success is True
