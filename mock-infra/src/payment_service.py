"""
Payment Microservice Simulator (Mock Target Service)
Simulates checkout processing, payment gateway interaction, and database persistence.
Used to demonstrate automated incident detection, sandbox reproduction, and patch validation.
"""

from __future__ import annotations

import time
import logging
from dataclasses import dataclass
from typing import Dict, Any, Optional

logger = logging.getLogger("payment_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


@dataclass(frozen=True, slots=True)
class PaymentConfig:
    # REGRESSION BUG IN COMMIT 4c21: db_timeout_seconds was reduced from 30.0 to 2.0
    # Under high latency or database load, transactions taking > 2.0s fail with 504 Gateway Timeout.
    db_timeout_seconds: float = 2.0
    max_retries: int = 2
    service_name: str = "checkout-payment-api"
    port: int = 8080


@dataclass(frozen=True, slots=True)
class PaymentRequest:
    order_id: str
    user_id: str
    amount_cents: int
    currency: str = "USD"
    payment_method: str = "credit_card"


@dataclass(frozen=True, slots=True)
class PaymentResponse:
    success: bool
    status_code: int
    transaction_id: Optional[str] = None
    error_message: Optional[str] = None
    duration_seconds: float = 0.0


class DatabaseConnectionPool:
    """Simulates a database connection pool with configurable query latency."""

    def __init__(self, timeout_seconds: float) -> None:
        self.timeout_seconds = timeout_seconds

    def execute_transaction(self, query: str, estimated_latency_seconds: float) -> Dict[str, Any]:
        """
        Executes a simulated database write.
        Raises TimeoutError if query execution exceeds timeout_seconds.
        """
        start_time = time.monotonic()
        
        if estimated_latency_seconds > self.timeout_seconds:
            # Simulate wait up to timeout threshold before throwing (scaled for fast test execution)
            time.sleep(min(self.timeout_seconds * 0.05, 0.1))
            logger.error(
                "Database lock timeout: query execution (%0.2fs) exceeded pool limit (%0.2fs)",
                estimated_latency_seconds,
                self.timeout_seconds,
            )
            raise TimeoutError(
                f"Database query exceeded configured timeout of {self.timeout_seconds}s"
            )

        # Successful simulated execution
        time.sleep(min(estimated_latency_seconds * 0.05, 0.05))  # Scaled sleep for realistic execution
        elapsed = time.monotonic() - start_time
        return {"status": "committed", "rows_affected": 1, "latency_seconds": elapsed}


class PaymentProcessor:
    """Core payment processing pipeline."""

    def __init__(self, config: Optional[PaymentConfig] = None) -> None:
        self.config = config or PaymentConfig()
        self.db_pool = DatabaseConnectionPool(timeout_seconds=self.config.db_timeout_seconds)

    def process_checkout(
        self, request: PaymentRequest, db_latency_seconds: float = 0.5
    ) -> PaymentResponse:
        """Processes a checkout payment request."""
        start_time = time.monotonic()
        logger.info("Processing checkout for order %s (Amount: %d %s)", request.order_id, request.amount_cents, request.currency)

        if request.amount_cents <= 0:
            return PaymentResponse(
                success=False,
                status_code=400,
                error_message="Invalid payment amount: amount must be greater than zero",
                duration_seconds=time.monotonic() - start_time,
            )

        try:
            # Step 1: Simulate database transaction
            db_result = self.db_pool.execute_transaction(
                query=f"INSERT INTO transactions (order_id, amount) VALUES ('{request.order_id}', {request.amount_cents})",
                estimated_latency_seconds=db_latency_seconds,
            )

            # Step 2: Generate transaction receipt
            tx_id = f"tx_{request.order_id}_{int(time.time())}"
            duration = time.monotonic() - start_time
            logger.info("Payment successful: %s (Duration: %0.3fs)", tx_id, duration)

            return PaymentResponse(
                success=True,
                status_code=200,
                transaction_id=tx_id,
                duration_seconds=duration,
            )

        except TimeoutError as err:
            duration = time.monotonic() - start_time
            logger.error("Checkout failed for order %s: 504 Gateway Timeout (%s)", request.order_id, err)
            return PaymentResponse(
                success=False,
                status_code=504,
                error_message=f"504 Gateway Timeout: {str(err)}",
                duration_seconds=duration,
            )
        except Exception as exc:
            duration = time.monotonic() - start_time
            logger.error("Unexpected checkout failure: %s", exc)
            return PaymentResponse(
                success=False,
                status_code=500,
                error_message=f"Internal Server Error: {str(exc)}",
                duration_seconds=duration,
            )
