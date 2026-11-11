"""Order events end to end: the Orders API writes `order.created` into the outbox in the same
statement as the order, the relay publishes it to real Kafka, and three consumer groups each do
their own work with it. This is what the playground's live fan-out replays."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy import Engine, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from contracts import ORDER_EVENT_GROUPS, OrderCreated, Trace, TraceSpan, notifications_key
from hub_harness import page_socket, receive
from messaging.kafka import KafkaError, Published
from orders_api.relay import OutboxRelay
from orders_api.settings import Settings
from stack_harness import Stack
from telemetry.background import BackgroundTraces

pytestmark = pytest.mark.integration

ORDER = {"product_id": "kb-7", "quantity": 2, "delivery": "express"}


@pytest.fixture
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(str(settings.database_url))
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def redis(settings: Settings) -> AsyncIterator[Redis]:
    client = Redis.from_url(str(settings.redis_url), decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


async def _order(stack: Stack) -> tuple[int, Trace]:
    auth = await stack.sandbox()
    response = await stack.client.post("/api/orders", json=ORDER, headers=auth)
    assert response.status_code == 201
    order_id: int = response.json()["id"]
    return order_id, await stack.finished_trace(response.headers["x-trace-id"])


async def _value(engine: AsyncEngine, sql: str, **params: Any) -> Any:
    async with engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one()


def _background(trace: Trace) -> list[TraceSpan]:
    assert trace.background is not None
    assert trace.background.state == "done"
    return trace.background.spans


def _consumed(spans: list[TraceSpan]) -> list[TraceSpan]:
    return [item for item in spans if item.kind == "consume"]


async def _notifications(redis: Redis, engine: AsyncEngine, order_id: int) -> list[str]:
    owner = await _value(engine, "SELECT owner_key FROM orders.orders WHERE id = :id", id=order_id)
    return [str(item) for item in await redis.lrange(notifications_key(owner), 0, -1)]


async def test_an_order_fans_out_to_every_consumer_group(
    event_stack: Stack, engine: AsyncEngine, redis: Redis
) -> None:
    order_id, trace = await _order(event_stack)
    assert [item.kind for item in trace.spans] == ["rate_limit", "validate", "handle", "db"]
    # The order and its event are one statement: there is no order without its event.
    assert "INSERT INTO orders.outbox" in trace.spans[-1].name

    publish, *rest = _background(trace)
    assert publish.kind == "publish"
    assert publish.service == "outbox-relay"
    assert publish.name == "produce test.orders.events (acks=all)"
    assert publish.attributes["key"] == str(order_id)
    consumed = _consumed(rest)
    assert sorted(str(item.attributes["group"]) for item in consumed) == sorted(ORDER_EVENT_GROUPS)
    for item in consumed:
        # Each group reads the same record: the order id is the key, so its events share a
        # partition and keep their order.
        assert item.attributes["partition"] == publish.attributes["partition"]
        assert item.attributes["offset"] == publish.attributes["offset"]
        assert item.start_ms >= publish.start_ms
        assert item.service == "order-worker"
    work = sorted(
        (str(item.attributes["group"]), item.kind) for item in rest if item not in consumed
    )
    assert work == [("analytics", "db"), ("inventory", "db"), ("notifications", "notify")]

    reserved = await _value(
        engine, "SELECT quantity FROM orders.reservations WHERE order_id = :id", id=order_id
    )
    assert reserved == 2
    async with engine.connect() as connection:
        sales = (
            await connection.execute(
                text("SELECT orders, quantity, revenue_cents FROM orders.daily_sales")
            )
        ).all()
    assert [tuple(row) for row in sales] == [(1, 2, 17800)]
    [notification] = await _notifications(redis, engine, order_id)
    assert json.loads(notification)["order_id"] == order_id


async def test_the_page_hears_of_its_order_over_its_socket(event_stack: Stack) -> None:
    assert event_stack.hub is not None
    auth = await event_stack.sandbox()
    token = auth["Authorization"].removeprefix("Bearer ")
    async with page_socket(event_stack.hub, token) as socket:
        assert (await receive(socket))["type"] == "ready"
        response = await event_stack.client.post("/api/orders", json=ORDER, headers=auth)
        trace_id = response.headers["x-trace-id"]
        await socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        notification = await receive(socket, 15)
        assert notification["event"] == "order.created"
        assert notification["order_id"] == response.json()["id"]
        assert await receive(socket, 15) == {"type": "trace.done", "trace_id": trace_id}
        fetched = await event_stack.client.get(f"/api/traces/{trace_id}")
    background = _background(Trace.model_validate(fetched.json()))
    [push] = [item for item in background if item.kind == "push"]
    notified = next(item for item in background if item.kind == "notify")
    assert push.start_ms >= notified.start_ms
    assert "group" not in push.attributes  # the hub's span, not a consumer group's


async def test_a_redelivered_event_changes_nothing(
    event_stack: Stack, engine: AsyncEngine, redis: Redis
) -> None:
    order_id, trace = await _order(event_stack)
    # As if the relay published the event and stopped before marking it: it goes out again.
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE orders.outbox SET published_at = NULL WHERE key = :key"),
            {"key": str(order_id)},
        )
    deadline = time.monotonic() + 20
    while len(_consumed(_background(trace))) < 2 * len(ORDER_EVENT_GROUPS):
        assert time.monotonic() < deadline, "the repeated event was not consumed"
        await asyncio.sleep(0.2)
        trace = await event_stack.finished_trace(trace.trace_id)

    spans = _background(trace)
    assert [item.kind for item in spans].count("publish") == 2
    assert len({item.attributes["offset"] for item in spans if item.kind == "publish"}) == 2
    # Every group handled the event once: the repeat was recognised by its id.
    assert await _value(engine, "SELECT count(*) FROM orders.reservations") == 1
    assert await _value(engine, "SELECT orders FROM orders.daily_sales") == 1
    assert len(await _notifications(redis, engine, order_id)) == 1
    handled = await _value(engine, "SELECT count(*) FROM orders.processed_events")
    assert handled == 2  # inventory and analytics; notifications keep their marker in Redis


async def test_deleting_the_sandbox_takes_what_the_groups_kept_for_it(
    event_stack: Stack, engine: AsyncEngine, redis: Redis
) -> None:
    auth = await event_stack.sandbox()
    response = await event_stack.client.post("/api/orders", json=ORDER, headers=auth)
    order_id = response.json()["id"]
    await event_stack.finished_trace(response.headers["x-trace-id"])
    owner = await _value(engine, "SELECT owner_key FROM orders.orders WHERE id = :id", id=order_id)
    assert await redis.exists(notifications_key(owner)) == 1

    assert (await event_stack.client.delete("/api/sandbox", headers=auth)).status_code == 204
    assert await redis.exists(notifications_key(owner)) == 0
    assert await _value(engine, "SELECT count(*) FROM orders.reservations") == 0
    # The day's totals are aggregates without an owner: they stay.
    assert await _value(engine, "SELECT orders FROM orders.daily_sales") == 1


def test_an_order_is_accepted_while_its_event_waits_in_the_outbox(
    api: TestClient, token: str, sync_engine: Engine
) -> None:
    """No relay and no Kafka here: the order does not depend on them."""
    response = api.post("/api/orders", json=ORDER, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    order_id = response.json()["id"]
    with sync_engine.connect() as connection:
        topic, key, payload, published_at = connection.execute(
            text("SELECT topic, key, payload, published_at FROM orders.outbox")
        ).one()
    assert (topic, key, published_at) == ("test.orders.events", str(order_id), None)
    event = OrderCreated.model_validate(payload)
    assert (event.order_id, event.product_id, event.quantity) == (order_id, "kb-7", 2)
    assert event.total_cents == 17800
    assert event.trace_id == response.headers["x-trace-id"]

    trace = Trace.model_validate(api.get(f"/api/traces/{event.trace_id}").json())
    assert trace.background is not None
    assert trace.background.state == "pending"


class _RefusingProducer:
    """Takes the first event, refuses the next one."""

    def __init__(self) -> None:
        self.sent = 0

    async def publish(self, topic: str, key: str, value: bytes) -> Published:
        self.sent += 1
        if self.sent > 1:
            raise KafkaError("NotEnoughReplicas")
        return Published(partition=0, offset=self.sent)


class _AcceptingProducer:
    def __init__(self) -> None:
        self.keys: list[str] = []

    async def publish(self, topic: str, key: str, value: bytes) -> Published:
        self.keys.append(key)
        return Published(partition=0, offset=len(self.keys))


def test_a_refused_publish_keeps_the_whole_batch_in_the_outbox(
    api: TestClient, token: str, settings: Settings, sync_engine: Engine
) -> None:
    auth = {"Authorization": f"Bearer {token}"}
    created = [api.post("/api/orders", json=ORDER, headers=auth).json()["id"] for _ in range(2)]

    async def relay_twice() -> list[str]:
        engine = create_async_engine(str(settings.database_url))
        redis = Redis.from_url(str(settings.redis_url), decode_responses=True)
        traces = BackgroundTraces(redis, 60)
        try:
            with pytest.raises(KafkaError):
                await OutboxRelay(engine, _RefusingProducer(), traces).relay_once()
            unpublished = await _value(
                engine, "SELECT count(*) FROM orders.outbox WHERE published_at IS NULL"
            )
            assert unpublished == 2  # the first event went out, but the batch rolled back
            accepting = _AcceptingProducer()
            assert await OutboxRelay(engine, accepting, traces).relay_once() == 2
            return accepting.keys
        finally:
            await redis.aclose()
            await engine.dispose()

    # Published again in the order the orders were created.
    assert asyncio.run(relay_twice()) == [str(order_id) for order_id in created]
    with sync_engine.connect() as connection:
        left = connection.execute(
            text("SELECT count(*) FROM orders.outbox WHERE published_at IS NULL")
        ).scalar_one()
    assert left == 0
