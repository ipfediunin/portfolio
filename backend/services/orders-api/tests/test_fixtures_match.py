"""The recorded fixtures still describe what the services do: the same request gives the same
status and the same sequence of spans — the Payments API's and the workers' spans included.
Re-record with scripts/record_fixtures.py after a change.

The requests go through the in-process stack, routed like the edge proxy routes them: webhooks to
the Payments API, the rest to the Orders API (which calls the Payments API for checkout). For queued
work the page's socket to the realtime hub is open, as when the fixtures were recorded."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import pytest

from contracts import SIGNATURE_HEADER
from contracts.webhooks import sign
from hub_harness import page_socket, receive
from orders_api.settings import Settings
from stack_harness import Stack, api_only

pytestmark = pytest.mark.integration

FIXTURES = sorted(
    (Path(__file__).resolve().parents[3] / "libs" / "contracts" / "fixtures").glob("*.json")
)
BURSTS = {"rate-limit": 6}
# The integration tests run on queues named with this prefix (see conftest.py).
QUEUE_PREFIX = "test."


def _load(path: Path) -> dict[str, Any]:
    fixture: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return fixture


def _queued(path: Path) -> bool:
    return _load(path)["trace"]["background"] is not None


def _event(path: Path) -> bool:
    """The background is an order event's (the relay and the consumer groups), not a job's."""
    background = _load(path)["trace"]["background"]
    return background is not None and background["spans"][0]["kind"] == "publish"


def _shape(spans: list[dict[str, Any]]) -> list[tuple[str, str]]:
    # The partition follows the order id's hash, which differs from run to run.
    return [
        (span["kind"], re.sub(r" p\d+$", "", span["name"].replace(QUEUE_PREFIX, "")))
        for span in spans
    ]


async def _replay(stack: Stack, fixture: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """Sends the recorded request; returns the status and the finished trace."""
    request = fixture["request"]
    auth, secret = await stack.sandbox_with_secret()
    headers = dict(auth) if request["authorized"] else {}
    if request.get("failAttempts") is not None:
        headers["X-Fault-Fail-Attempts"] = str(request["failAttempts"])
    if request.get("providerDown"):
        headers["X-Fault-Provider-Down"] = "true"
    body = None if request["body"] is None else json.dumps(request["body"]).encode()
    if body is not None:
        headers["Content-Type"] = "application/json"
    if request.get("signed") and body is not None:
        headers[SIGNATURE_HEADER] = sign(secret, int(time.time()), body)
    client = stack.route(request["path"])
    for _ in range(BURSTS.get(fixture["scenario"], 1) - 1):
        await client.request(request["method"], request["path"], headers=headers)
    if fixture["trace"]["background"] is None or stack.hub is None:
        response = await client.request(
            request["method"], request["path"], headers=headers, content=body
        )
        trace = await stack.finished_trace(response.headers["x-trace-id"])
        return response.status_code, trace.model_dump()
    async with page_socket(stack.hub, auth["Authorization"].removeprefix("Bearer ")) as socket:
        assert (await receive(socket))["type"] == "ready"
        response = await client.request(
            request["method"], request["path"], headers=headers, content=body
        )
        trace_id = response.headers["x-trace-id"]
        await socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        while (await receive(socket, 30)) != {"type": "trace.done", "trace_id": trace_id}:
            pass  # notifications of this request; the trace is what is compared
        trace = await stack.finished_trace(trace_id)
    return response.status_code, trace.model_dump()


@pytest.mark.parametrize(
    "path", [path for path in FIXTURES if not _queued(path)], ids=lambda path: path.stem
)
async def test_service_behaves_as_recorded(
    settings: Settings, clean_state: None, path: Path
) -> None:
    fixture = _load(path)
    async with api_only(settings) as stack:
        status, trace = await _replay(stack, fixture)
    assert status == fixture["response"]["status"]
    assert _shape(trace["spans"]) == _shape(fixture["trace"]["spans"])


@pytest.mark.broker
@pytest.mark.parametrize(
    "path",
    [path for path in FIXTURES if _queued(path) and not _event(path)],
    ids=lambda path: path.stem,
)
async def test_jobs_behave_as_recorded(stack: Stack, path: Path) -> None:
    fixture = _load(path)
    status, trace = await _replay(stack, fixture)
    assert status == fixture["response"]["status"]
    assert _shape(trace["spans"]) == _shape(fixture["trace"]["spans"])
    assert _shape(trace["background"]["spans"]) == _shape(fixture["trace"]["background"]["spans"])


@pytest.mark.broker
@pytest.mark.parametrize("path", [path for path in FIXTURES if _event(path)], ids=lambda p: p.stem)
async def test_events_behave_as_recorded(event_stack: Stack, path: Path) -> None:
    fixture = _load(path)
    status, trace = await _replay(event_stack, fixture)
    assert status == fixture["response"]["status"]
    assert _shape(trace["spans"]) == _shape(fixture["trace"]["spans"])
    # The groups work side by side, so their spans interleave differently every time.
    assert sorted(_shape(trace["background"]["spans"])) == sorted(
        _shape(fixture["trace"]["background"]["spans"])
    )
