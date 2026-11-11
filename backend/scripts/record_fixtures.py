"""Records the contract fixtures (libs/contracts/fixtures) from the running compose stack.

One exchange per live scenario of the website's playground: the request it sends, the response,
the round trip and the trace — for queued work, the finished trace with the workers' spans. Like
the page, the recorder keeps the sandbox's socket to the realtime hub open, so the hub's pushes are
in the traces, and it fetches a queued trace when the hub says it is done.

    docker compose up -d --build
    uv run python scripts/record_fixtures.py [--base-url http://127.0.0.1:8000]

The integration tests check that the service still behaves as recorded (same status, same spans);
the website's tests check that every fixture replays correctly on the city.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
from websockets.sync.client import ClientConnection, connect
from websockets.typing import Origin

from contracts import SIGNATURE_HEADER
from contracts.webhooks import sign

FIXTURES = Path(__file__).resolve().parents[1] / "libs" / "contracts" / "fixtures"
SHOWN_HEADERS = (
    "content-type",
    "x-trace-id",
    "x-cache",
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "www-authenticate",
    "location",
    "x-idempotent-replay",
    "server-timing",
)
PAYMENT = {"order_id": 42, "amount": 129.9, "currency": "EUR"}

# scenario → the request the playground sends with the scenario's defaults
SCENARIOS: dict[str, dict[str, Any]] = {
    "sync-read": {"method": "GET", "path": "/api/orders/42", "authorized": True},
    "cache": {"method": "GET", "path": "/api/products/7", "authorized": True},
    "validation": {
        "method": "POST",
        "path": "/api/orders",
        "authorized": True,
        "body": {"product_id": "kb-7", "quantity": 0, "delivery": "rocket"},
    },
    "auth": {"method": "GET", "path": "/api/orders", "authorized": False},
    # The rate-limit scenario's burst: the recorded exchange is the first refused request.
    "rate-limit": {"method": "GET", "path": "/api/products/7", "authorized": True, "burst": 6},
    "async-job": {
        "method": "POST",
        "path": "/api/reports",
        "authorized": True,
        "body": {"period": "2026-10"},
    },
    "retry": {
        "method": "POST",
        "path": "/api/orders/42/pay",
        "authorized": True,
        "body": PAYMENT,
        "failAttempts": 2,
    },
    "dead-letter": {
        "method": "POST",
        "path": "/api/orders/42/pay",
        "authorized": True,
        "body": PAYMENT,
        "failAttempts": 3,
    },
    # Checkout with the provider down: the Payments API waits out its timeout (the first of the
    # three failures that open its circuit breaker).
    "circuit-breaker": {
        "method": "GET",
        "path": "/api/orders/42/checkout",
        "authorized": True,
        "providerDown": True,
    },
    # The provider's webhook, signed with the sandbox's secret, through the edge to Django.
    "webhook": {
        "method": "POST",
        "path": "/webhooks/payments",
        "authorized": True,
        "signed": True,
        "body": {"id": "evt_8f3a", "type": "payment.succeeded", "data": {"order_id": 42}},
    },
    # An order: its order.created event goes through the outbox and Kafka to three consumer groups.
    "fan-out": {
        "method": "POST",
        "path": "/api/orders",
        "authorized": True,
        "body": {"product_id": "kb-7", "quantity": 1, "delivery": "standard"},
    },
}


ORIGIN = "http://localhost:3000"


def _trace(api: httpx.Client, trace_id: str) -> dict[str, Any]:
    response = api.get(f"/api/traces/{trace_id}")
    response.raise_for_status()
    trace: dict[str, Any] = response.json()
    return trace


def _finished_trace(api: httpx.Client, socket: ClientConnection, trace_id: str) -> dict[str, Any]:
    """The trace once whatever the request queued is done, as the hub announces it."""
    trace = _trace(api, trace_id)
    if trace.get("background") is None:
        return trace
    socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
    deadline = time.monotonic() + 30
    while True:
        message = json.loads(socket.recv(timeout=max(0.1, deadline - time.monotonic())))
        if message == {"type": "trace.done", "trace_id": trace_id}:
            return _trace(api, trace_id)


@contextlib.contextmanager
def _page_socket(base_url: str, token: str) -> Iterator[ClientConnection]:
    """The sandbox's socket to the realtime hub, through the edge, as the page opens it."""
    url = base_url.replace("http://", "ws://", 1) + "/ws"
    with connect(url, origin=Origin(ORIGIN)) as socket:
        socket.send(json.dumps({"type": "auth", "token": token}))
        ready = json.loads(socket.recv(timeout=5))
        if ready.get("type") != "ready":
            raise RuntimeError(f"The hub did not accept the sandbox: {ready}")
        yield socket


def _exchange(
    api: httpx.Client,
    socket: ClientConnection,
    sandbox: dict[str, Any],
    scenario: str,
    spec: dict[str, Any],
) -> dict[str, Any]:
    auth = {"Authorization": f"Bearer {sandbox['token']}"}
    # A fresh cache and rate-limit bucket for every scenario (sandboxes per IP are limited).
    api.post("/api/sandbox/reset", headers=auth).raise_for_status()
    headers = dict(auth) if spec["authorized"] else {}
    if "failAttempts" in spec:
        headers["X-Fault-Fail-Attempts"] = str(spec["failAttempts"])
    if spec.get("providerDown"):
        headers["X-Fault-Provider-Down"] = "true"
    body = None if spec.get("body") is None else json.dumps(spec["body"]).encode()
    if body is not None:
        headers["Content-Type"] = "application/json"
    if spec.get("signed") and body is not None:
        headers[SIGNATURE_HEADER] = sign(sandbox["webhook_secret"], int(time.time()), body)
    for _ in range(spec.get("burst", 1) - 1):
        api.request(spec["method"], spec["path"], headers=headers)
    started = time.perf_counter()
    response = api.request(spec["method"], spec["path"], headers=headers, content=body)
    round_trip_ms = round((time.perf_counter() - started) * 1000, 2)
    request = {key: spec.get(key) for key in ("method", "path", "authorized", "body")}
    for flag in ("failAttempts", "providerDown", "signed"):
        if flag in spec:
            request[flag] = spec[flag]
    return {
        "scenario": scenario,
        "request": request,
        "response": {
            "status": response.status_code,
            "statusText": response.reason_phrase,
            "headers": {
                name: response.headers[name] for name in SHOWN_HEADERS if name in response.headers
            },
            "body": response.json(),
        },
        "roundTripMs": round_trip_ms,
        "trace": _finished_trace(api, socket, response.headers["x-trace-id"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    FIXTURES.mkdir(parents=True, exist_ok=True)
    with httpx.Client(base_url=args.base_url, timeout=10) as api:
        created = api.post("/api/sandbox")
        created.raise_for_status()
        sandbox: dict[str, Any] = created.json()
        token = sandbox["token"]
        try:
            with _page_socket(args.base_url, token) as socket:
                for scenario, spec in SCENARIOS.items():
                    exchange = _exchange(api, socket, sandbox, scenario, spec)
                    path = FIXTURES / f"{scenario}.json"
                    path.write_text(json.dumps(exchange, indent=2) + "\n", encoding="utf-8")
                    print(f"{path.name}: {exchange['response']['status']}")  # noqa: T201
        finally:
            api.delete("/api/sandbox", headers={"Authorization": f"Bearer {token}"})


if __name__ == "__main__":
    main()
