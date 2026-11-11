"""The demo routes against real PostgreSQL and Redis: what the playground's live mode relies on."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from contracts import Trace
from orders_api.app import create_app
from orders_api.settings import Settings

pytestmark = pytest.mark.integration

TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _trace(api: TestClient, response: Response) -> Trace:
    trace_id = response.headers["x-trace-id"]
    fetched = api.get(f"/api/traces/{trace_id}")
    assert fetched.status_code == 200
    return Trace.model_validate(fetched.json())


def _kinds(trace: Trace) -> list[str]:
    return [item.kind for item in trace.spans]


def test_reads_the_shared_order_with_a_sandbox_token(api: TestClient, token: str) -> None:
    response = api.get("/api/orders/42", headers={**_auth(token), "traceparent": TRACEPARENT})
    assert response.status_code == 200
    assert response.json()["total"] == 129.9
    assert response.headers["x-trace-id"] == "0af7651916cd43dd8448eb211c80319c"
    assert "db;dur=" in response.headers["server-timing"]
    trace = _trace(api, response)
    assert _kinds(trace) == ["rate_limit", "auth", "handle", "db"]
    assert trace.status == 200
    assert all(item.ok for item in trace.spans)


def test_protected_routes_answer_401_without_a_token(api: TestClient) -> None:
    response = api.get("/api/orders")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
    assert response.headers["www-authenticate"] == "Bearer"
    trace = _trace(api, response)
    assert _kinds(trace) == ["rate_limit", "auth"]
    assert not trace.spans[-1].ok


def test_product_reads_go_through_the_cache(api: TestClient, token: str) -> None:
    first = api.get("/api/products/7", headers=_auth(token))
    second = api.get("/api/products/7", headers=_auth(token))
    assert first.headers["x-cache"] == "MISS"
    assert second.headers["x-cache"] == "HIT"
    assert first.headers["cache-control"] == "no-store"
    assert (
        first.json()
        == second.json()
        == {
            "id": 7,
            "sku": "kb-7",
            "name": "Mechanical keyboard",
            "price": 89.0,
            "currency": "EUR",
        }
    )
    assert _kinds(_trace(api, first)) == ["rate_limit", "handle", "cache_get", "db", "cache_set"]
    hit = _trace(api, second)
    assert _kinds(hit) == ["rate_limit", "handle", "cache_get"]
    assert hit.spans[-1].attributes["hit"] is True


def test_no_cache_skips_the_cache_read(api: TestClient, token: str) -> None:
    api.get("/api/products/7", headers=_auth(token))
    response = api.get("/api/products/7", headers={**_auth(token), "Cache-Control": "no-cache"})
    assert response.headers["x-cache"] == "BYPASS"
    assert _kinds(_trace(api, response)) == ["rate_limit", "handle", "db", "cache_set"]


def test_each_sandbox_has_its_own_cache(api: TestClient, token: str) -> None:
    other = api.post("/api/sandbox").json()["token"]
    api.get("/api/products/7", headers=_auth(token))
    assert api.get("/api/products/7", headers=_auth(other)).headers["x-cache"] == "MISS"


def test_invalid_order_gets_fastapi_422(api: TestClient, token: str) -> None:
    response = api.post(
        "/api/orders",
        json={"product_id": "kb-7", "quantity": 0, "delivery": "rocket"},
        headers=_auth(token),
    )
    assert response.status_code == 422
    detail: list[dict[str, Any]] = response.json()["detail"]
    assert [(item["loc"], item["type"]) for item in detail] == [
        (["body", "quantity"], "greater_than_equal"),
        (["body", "delivery"], "literal_error"),
    ]
    assert detail[0]["msg"] == "Input should be greater than or equal to 1"
    assert detail[1]["msg"] == "Input should be 'standard' or 'express'"
    trace = _trace(api, response)
    assert _kinds(trace) == ["rate_limit", "validate"]
    assert trace.spans[-1].attributes["errors"] == 2


def test_broken_json_gets_json_invalid(api: TestClient) -> None:
    response = api.post(
        "/api/orders", content=b'{"product_id": ', headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "json_invalid"


def test_creates_an_order_that_expires_with_the_sandbox(api: TestClient, token: str) -> None:
    response = api.post(
        "/api/orders",
        json={"product_id": "kb-7", "quantity": 2, "delivery": "express"},
        headers=_auth(token),
    )
    assert response.status_code == 201
    order = response.json()
    assert order["total"] == 178.0
    assert order["id"] >= 1001
    assert order["expires_at"] is not None
    assert _kinds(_trace(api, response)) == ["rate_limit", "validate", "handle", "db"]

    listed = api.get("/api/orders", headers=_auth(token)).json()
    # The shared demo orders (36 to 42) and the sandbox's own.
    assert {item["id"] for item in listed["items"]} == {*range(36, 43), order["id"]}
    other = api.post("/api/sandbox").json()["token"]
    assert api.get(f"/api/orders/{order['id']}", headers=_auth(other)).status_code == 404


def test_unknown_product_is_404(api: TestClient) -> None:
    response = api.post(
        "/api/orders", json={"product_id": "nope-1", "quantity": 1, "delivery": "standard"}
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Product 'nope-1' not found"}


def test_a_burst_runs_into_the_token_bucket(api: TestClient, token: str) -> None:
    statuses = [api.get("/api/products/7", headers=_auth(token)).status_code for _ in range(8)]
    assert statuses[:5] == [200] * 5
    assert statuses[5:] == [429] * 3
    limited = api.get("/api/products/7", headers=_auth(token))
    assert limited.json() == {"detail": "Too Many Requests"}
    assert int(limited.headers["retry-after"]) >= 1
    assert limited.headers["x-ratelimit-remaining"] == "0"
    trace = _trace(api, limited)
    assert _kinds(trace) == ["rate_limit"]
    assert not trace.spans[0].ok


def test_reset_refills_the_bucket_and_clears_the_cache(api: TestClient, token: str) -> None:
    for _ in range(6):
        api.get("/api/products/7", headers=_auth(token))
    assert api.post("/api/sandbox/reset", headers=_auth(token)).status_code == 204
    response = api.get("/api/products/7", headers=_auth(token))
    assert response.status_code == 200
    assert response.headers["x-cache"] == "MISS"


def test_sandbox_state_and_deletion(api: TestClient, token: str) -> None:
    api.post(
        "/api/orders",
        json={"product_id": "ms-3", "quantity": 1, "delivery": "standard"},
        headers=_auth(token),
    )
    api.get("/api/products/3", headers=_auth(token))
    state = api.get("/api/sandbox", headers=_auth(token)).json()
    assert state["orders"] == 1
    assert state["cached_entries"] == 1
    assert 0 < state["expires_in"] <= 1800

    assert api.delete("/api/sandbox", headers=_auth(token)).status_code == 204
    assert api.get("/api/sandbox", headers=_auth(token)).status_code == 401
    assert api.get("/api/orders", headers=_auth(token)).status_code == 401


def test_unknown_traces_are_404(api: TestClient) -> None:
    assert api.get(f"/api/traces/{'c' * 32}").status_code == 404
    assert api.get("/api/traces/not-a-trace-id").status_code == 422


def test_cors_allows_the_website_and_exposes_trace_headers(
    api: TestClient, token: str, website_origin: str
) -> None:
    origin = website_origin
    preflight = api.options(
        "/api/orders/42",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,traceparent",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == origin
    response = api.get("/api/orders/42", headers={**_auth(token), "Origin": origin})
    exposed = response.headers["access-control-expose-headers"].lower()
    assert "x-trace-id" in exposed
    assert "server-timing" in exposed
    other = api.options(
        "/api/orders/42",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in other.headers


def test_health_endpoints(api: TestClient) -> None:
    assert api.get("/healthz").json() == {"status": "ok"}
    checks = api.get("/readyz").json()["checks"]
    assert checks["redis"] == checks["postgres"] == "ok"
    assert "rabbitmq" in checks  # ready with the broker: see test_jobs.py


def test_without_redis_the_api_fails_fast_with_503(settings: Settings) -> None:
    """Chaos experiment `redis-down` found a 500 after five seconds; it is a fast 503 now."""
    offline = settings.model_copy(update={"redis_url": "redis://127.0.0.1:1/0"})
    with TestClient(create_app(offline)) as client:
        started = time.monotonic()
        response = client.get("/api/products/7")
        elapsed = time.monotonic() - started
    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert response.json() == {"detail": "Temporarily unavailable, try again later"}
    assert elapsed < 1.5
