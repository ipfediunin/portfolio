"""Load profile of the live backend: playground visitors, each with a sandbox of their own.

A visitor does what the playground's Live API mode does, in about the proportions people use it:
reads (an order, a cached product), a validation error, orders (outbox → Kafka → three consumer
groups), report jobs and payments (RabbitMQ → worker → provider stub), checkout through the
Payments API (Django) and signed provider webhooks.

For queued work the visitor waits for the background part as the page does and reports its
end-to-end time as an extra entry (`ASYNC`): measured by the services themselves, from the
request's start to the end of the last background span in its trace.

Run it through scripts/run_load.py (it starts the compose override that lifts the per-visitor
rate limits: the test measures the services, not the limiter) or directly:
    uv run --group load locust -f scripts/locustfile.py --host http://127.0.0.1:8000
"""

from __future__ import annotations

import json
import time
import uuid
from http import HTTPStatus
from typing import Any

from locust import HttpUser, between, task

from contracts import SIGNATURE_HEADER
from contracts.webhooks import sign

PAYMENT = {"order_id": 42, "amount": 129.9, "currency": "EUR"}
ORDER = {"product_id": "kb-7", "quantity": 1, "delivery": "standard"}
INVALID_ORDER = {"product_id": "kb-7", "quantity": 0, "delivery": "rocket"}
# How long a visitor waits for queued work before giving up on it (the page waits 30 s).
BACKGROUND_WAIT_S = 30.0
POLL_S = 0.25


def _background_end_ms(trace: dict[str, Any]) -> float | None:
    """When the last background span ended, on the request's clock (None while pending)."""
    background = trace.get("background")
    if not isinstance(background, dict) or background.get("state") != "done":
        return None
    spans = background.get("spans") or []
    return max((span["start_ms"] + span["duration_ms"] for span in spans), default=0.0)


class Visitor(HttpUser):
    wait_time = between(0.2, 1.0)

    def on_start(self) -> None:
        response = self.client.post("/api/sandbox", name="POST /api/sandbox")
        response.raise_for_status()
        created = response.json()
        self.auth = {"Authorization": f"Bearer {created['token']}"}
        self.webhook_secret: str = created["webhook_secret"]

    def on_stop(self) -> None:
        self.client.delete("/api/sandbox", headers=self.auth, name="DELETE /api/sandbox")

    @task(4)
    def read_order(self) -> None:
        self.client.get("/api/orders/42", headers=self.auth, name="GET /api/orders/42")

    @task(4)
    def read_product(self) -> None:
        self.client.get("/api/products/7", headers=self.auth, name="GET /api/products/7")

    @task(1)
    def invalid_order(self) -> None:
        with self.client.post(
            "/api/orders",
            json=INVALID_ORDER,
            headers=self.auth,
            name="POST /api/orders (422)",
            catch_response=True,
        ) as response:
            if response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY:
                response.success()
            else:
                response.failure(f"expected 422, got {response.status_code}")

    @task(2)
    def create_order(self) -> None:
        response = self.client.post(
            "/api/orders", json=ORDER, headers=self.auth, name="POST /api/orders"
        )
        if response.status_code == HTTPStatus.CREATED:
            self._await_background(response, "order → Kafka → 3 groups")

    @task(1)
    def report_job(self) -> None:
        response = self.client.post(
            "/api/reports", json={"period": "2026-10"}, headers=self.auth, name="POST /api/reports"
        )
        if response.status_code == HTTPStatus.ACCEPTED:
            self._await_background(response, "report job → worker")

    @task(1)
    def payment(self) -> None:
        response = self.client.post(
            "/api/orders/42/pay",
            json=PAYMENT,
            headers=self.auth,
            name="POST /api/orders/42/pay",
        )
        if response.status_code == HTTPStatus.ACCEPTED:
            self._await_background(response, "payment job → worker → provider")

    @task(1)
    def checkout(self) -> None:
        self.client.get(
            "/api/orders/42/checkout", headers=self.auth, name="GET /api/orders/42/checkout"
        )

    @task(1)
    def webhook(self) -> None:
        event = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "type": "payment.succeeded",
            "data": {"order_id": 42},
        }
        body = json.dumps(event).encode()
        headers = {
            **self.auth,
            "Content-Type": "application/json",
            SIGNATURE_HEADER: sign(self.webhook_secret, int(time.time()), body),
        }
        self.client.post(
            "/webhooks/payments", data=body, headers=headers, name="POST /webhooks/payments"
        )

    def _await_background(self, response: Any, name: str) -> None:
        """Polls the trace like the page does; reports the services' own end-to-end time."""
        trace_id = response.headers.get("x-trace-id")
        if not trace_id:
            return
        deadline = time.monotonic() + BACKGROUND_WAIT_S
        while time.monotonic() < deadline:
            time.sleep(POLL_S)
            fetched = self.client.get(f"/api/traces/{trace_id}", name="GET /api/traces/[id]")
            if fetched.status_code != HTTPStatus.OK:
                continue
            end_ms = _background_end_ms(fetched.json())
            if end_ms is not None:
                self.environment.events.request.fire(
                    request_type="ASYNC",
                    name=name,
                    response_time=end_ms,
                    response_length=0,
                    exception=None,
                    context={},
                )
                return
        self.environment.events.request.fire(
            request_type="ASYNC",
            name=name,
            response_time=BACKGROUND_WAIT_S * 1000,
            response_length=0,
            exception=TimeoutError(f"the background part of {trace_id} did not finish"),
            context={},
        )
