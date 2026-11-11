"""Checkout end to end: the Orders API calls the Payments API (Django, in-process), which asks the
provider behind its circuit breaker. What the playground's circuit-breaker scenario replays."""

from __future__ import annotations

import time

import httpx
import pytest
from fastapi.testclient import TestClient
from redis import Redis

from contracts import Trace, client_key, token_hash
from orders_api.settings import Settings
from stack_harness import Stack, api_only

pytestmark = pytest.mark.integration

REDIS_URL = "redis://127.0.0.1:6380/15"
DOWN = {"X-Fault-Provider-Down": "true"}


async def _trace(stack: Stack, response: httpx.Response) -> Trace:
    return await stack.finished_trace(response.headers["x-trace-id"])


def _breaker_key(auth: dict[str, str]) -> str:
    token = auth["Authorization"].removeprefix("Bearer ")
    return f"breaker:{client_key(token_hash(token))}:provider"


async def test_checkout_asks_the_provider_through_the_payments_api(
    settings: Settings, clean_state: None
) -> None:
    async with api_only(settings) as stack:
        auth = await stack.sandbox()
        response = await stack.client.get("/api/orders/42/checkout", headers=auth)
        assert response.status_code == 200
        assert response.json() == {"order_id": 42, "payment_methods": ["card", "sbp"]}
        trace = await _trace(stack, response)

    # One trace across both services, in order: the Payments API's spans sit inside the request.
    assert [(span.service, span.kind) for span in trace.spans] == [
        ("orders-api", "rate_limit"),
        ("orders-api", "handle"),
        ("payments-api", "breaker"),
        ("payments-api", "external"),
        ("payments-api", "breaker"),
    ]
    acquire, call, record = trace.spans[2:]
    assert acquire.attributes == {"state": "closed", "failures": 0}
    assert call.name == "GET /v1/payment-methods"
    assert record.attributes == {"state": "closed", "failures": 0}


async def test_three_timeouts_open_the_breaker_then_it_fails_fast(
    settings: Settings, clean_state: None
) -> None:
    async with api_only(settings) as stack:
        auth = await stack.sandbox()
        statuses = []
        for _ in range(4):
            response = await stack.client.get("/api/orders/42/checkout", headers={**auth, **DOWN})
            statuses.append(response.status_code)
        assert statuses == [504, 504, 504, 503]
        assert response.json() == {"detail": "Payment provider is unavailable, try again later"}
        assert response.headers["retry-after"] == "8"
        fast = await _trace(stack, response)

        # Another visitor's breaker is untouched.
        other = await stack.client.get("/api/orders/42/checkout", headers=await stack.sandbox())
        assert other.status_code == 200

    assert [span.kind for span in fast.spans] == ["rate_limit", "handle", "breaker"]
    assert fast.spans[-1].attributes["state"] == "open"
    assert not fast.spans[-1].ok


async def test_after_the_cooldown_one_trial_closes_the_breaker(
    settings: Settings, clean_state: None
) -> None:
    async with api_only(settings) as stack:
        auth = await stack.sandbox()
        for _ in range(3):
            await stack.client.get("/api/orders/42/checkout", headers={**auth, **DOWN})
        # The cooldown has passed (moved back instead of waiting eight seconds).
        Redis.from_url(REDIS_URL).hset(
            _breaker_key(auth), "opened_at", int(time.time() * 1000) - 9000
        )
        trial = await stack.client.get("/api/orders/42/checkout", headers=auth)
        assert trial.status_code == 200
        trace = await _trace(stack, trial)

    breaker_spans = [span for span in trace.spans if span.kind == "breaker"]
    assert [span.attributes["state"] for span in breaker_spans] == ["half_open", "closed"]


def test_without_the_payments_api_checkout_answers_502(api: TestClient) -> None:
    # The `api` fixture has no Payments API behind it: its address does not resolve.
    response = api.get("/api/orders/42/checkout")
    assert response.status_code == 502
    assert response.json() == {"detail": "The payments service is unavailable"}
