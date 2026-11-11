"""The realtime hub against real Redis, through real WebSockets: who hears what, when a trace is
announced done, and when a socket is closed."""

from __future__ import annotations

import json
import secrets
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
import pytest
from redis.asyncio import Redis
from websockets.exceptions import InvalidStatus

from contracts import (
    CloseCode,
    Notification,
    TraceSpan,
    background_spans_key,
    client_key,
    sandbox_key,
    token_hash,
)
from hub_harness import close_code, new_sandbox, nothing_arrives, page_socket, receive
from messaging.notifications import Notifier
from realtime_hub.settings import HubSettings
from telemetry.background import BackgroundTraces

pytestmark = pytest.mark.integration


@pytest.fixture
async def redis(hub_settings: HubSettings) -> AsyncIterator[Redis]:
    client = Redis.from_url(str(hub_settings.redis_url), decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


def _trace_id() -> str:
    return secrets.token_hex(16)


def _report_ready(trace_id: str) -> Notification:
    return Notification(
        event="report.ready",
        task_id=uuid.uuid4(),
        trace_id=trace_id,
        trace_started_at=time.time() - 1,
        at=datetime.now(UTC),
    )


async def _owner(token: str) -> str:
    return client_key(token_hash(token))


async def _background(redis: Redis, trace_id: str) -> list[TraceSpan]:
    raw = await redis.lrange(background_spans_key(trace_id), 0, -1)
    return [TraceSpan.model_validate_json(item) for item in raw]


async def test_a_page_hears_its_own_notifications_and_nobody_elses(hub: str, redis: Redis) -> None:
    mine, theirs = await new_sandbox(redis), await new_sandbox(redis)
    async with page_socket(hub, mine) as socket, page_socket(hub, theirs) as other:
        ready = await receive(socket)
        assert ready["type"] == "ready"
        assert 1700 < ready["expires_in"] <= 1800
        assert (await receive(other))["type"] == "ready"

        trace_id = _trace_id()
        notification = _report_ready(trace_id)
        assert await Notifier(redis).notify(await _owner(mine), notification, once="t-1")
        message = await receive(socket)
        assert message == {
            "type": "notification",
            "event": "report.ready",
            "task_id": str(notification.task_id),
            "order_id": None,
            "trace_id": trace_id,
            "at": notification.at.isoformat().replace("+00:00", "Z"),
        }
        assert await nothing_arrives(other)
        # The same notification again (a redelivered job) is not pushed twice.
        assert not await Notifier(redis).notify(await _owner(mine), notification, once="t-1")
        assert await nothing_arrives(socket)

    [push] = await _background(redis, trace_id)
    assert push.kind == "push"
    assert push.service == "realtime-hub"
    assert push.name == "ws.send report.ready"
    assert push.attributes == {"event": "report.ready", "connections": 1, "hub": "test-hub"}
    assert push.start_ms >= 1000  # on the request's clock, a second after it started


async def test_the_push_is_in_the_trace_before_the_trace_is_announced_done(
    hub: str, redis: Redis
) -> None:
    token = await new_sandbox(redis)
    async with page_socket(hub, token) as socket:
        await receive(socket)
        trace_id = _trace_id()
        await socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        # As the worker does it: notify, then mark the trace done.
        await Notifier(redis).notify(await _owner(token), _report_ready(trace_id), once="t-2")
        await BackgroundTraces(redis, 60).finish(trace_id)

        assert (await receive(socket))["type"] == "notification"
        assert await receive(socket) == {"type": "trace.done", "trace_id": trace_id}
        # What the page fetches now already has the push.
        assert [span.kind for span in await _background(redis, trace_id)] == ["push"]


async def test_a_trace_done_before_the_watch_is_answered_at_once(hub: str, redis: Redis) -> None:
    token = await new_sandbox(redis)
    trace_id = _trace_id()
    await BackgroundTraces(redis, 60).finish(trace_id)
    async with page_socket(hub, token) as socket:
        await receive(socket)
        await socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        assert await receive(socket) == {"type": "trace.done", "trace_id": trace_id}


async def test_only_the_watcher_hears_a_trace_is_done(hub: str, redis: Redis) -> None:
    first, second = await new_sandbox(redis), await new_sandbox(redis)
    async with page_socket(hub, first) as watching, page_socket(hub, second) as other:
        await receive(watching)
        await receive(other)
        trace_id = _trace_id()
        await watching.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        await nothing_arrives(watching, 0.2)  # the watch is registered
        await BackgroundTraces(redis, 60).finish(trace_id)
        assert (await receive(watching))["trace_id"] == trace_id
        assert await nothing_arrives(other)


async def test_a_socket_without_auth_is_closed(hub: str) -> None:
    async with page_socket(hub, None) as socket:
        assert await close_code(socket) == CloseCode.AUTH_TIMEOUT


async def test_an_unknown_token_is_refused(hub: str) -> None:
    async with page_socket(hub, secrets.token_urlsafe(32)) as socket:
        assert await close_code(socket) == CloseCode.UNAUTHORIZED


async def test_garbage_closes_the_socket(hub: str, redis: Redis) -> None:
    token = await new_sandbox(redis)
    async with page_socket(hub, token) as socket:
        await receive(socket)
        await socket.send("not json")
        assert await close_code(socket) == CloseCode.POLICY
    async with page_socket(hub, token) as socket:
        await receive(socket)
        await socket.send(json.dumps({"type": "auth", "token": token}))  # a second auth
        assert await close_code(socket) == CloseCode.POLICY


async def test_a_page_from_another_site_cannot_open_a_socket(hub: str, redis: Redis) -> None:
    token = await new_sandbox(redis)
    with pytest.raises(InvalidStatus) as refused:
        async with page_socket(hub, token, origin="https://elsewhere.example"):
            pass
    assert refused.value.response.status_code == 403


async def test_a_sandbox_gets_a_few_sockets_not_more(
    hub: str, redis: Redis, hub_settings: HubSettings
) -> None:
    token = await new_sandbox(redis)
    async with (
        page_socket(hub, token) as first,
        page_socket(hub, token) as second,
        page_socket(hub, token) as third,
    ):
        for socket in (first, second, third):
            assert (await receive(socket))["type"] == "ready"
        assert hub_settings.max_connections_per_sandbox == 3
        async with page_socket(hub, token) as fourth:
            assert await close_code(fourth) == CloseCode.TOO_MANY
    # Closed sockets give their slots back.
    async with page_socket(hub, token) as again:
        assert (await receive(again))["type"] == "ready"


async def test_deleting_the_sandbox_closes_its_socket(hub: str, redis: Redis) -> None:
    token = await new_sandbox(redis)
    async with page_socket(hub, token) as socket:
        await receive(socket)
        await redis.delete(sandbox_key(token_hash(token)))
        assert await close_code(socket) == CloseCode.SANDBOX_GONE


async def test_watching_too_many_traces_closes_the_socket(
    hub: str, redis: Redis, hub_settings: HubSettings
) -> None:
    token = await new_sandbox(redis)
    async with page_socket(hub, token) as socket:
        await receive(socket)
        for _ in range(hub_settings.max_watches + 1):
            await socket.send(json.dumps({"type": "watch", "trace_id": _trace_id()}))
        assert await close_code(socket) == CloseCode.POLICY


async def test_health_reports_the_subscription(hub: str) -> None:
    async with httpx.AsyncClient(base_url=hub) as client:
        response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "sockets": 0}
