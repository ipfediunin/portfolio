"""What the bot reads and does, against the real stores and the in-process stack: queues, outbox,
consumer lag, and the replay of a dead letter back to its work queue."""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import Engine, text

from ops_bot.ops import Ops
from ops_bot.settings import BotSettings
from stack_harness import Stack

pytestmark = [pytest.mark.integration, pytest.mark.broker]

PAYMENT = {"order_id": 42, "amount": 129.9, "currency": "EUR"}


def _health(request: httpx.Request) -> httpx.Response:
    """The services' health endpoints, as they answer when all is well."""
    if request.url.path == "/readyz":
        checks = {"redis": "ok", "postgres": "ok", "rabbitmq": "ok"}
        return httpx.Response(200, json={"status": "ready", "checks": checks})
    if request.url.host == "realtime-hub":
        return httpx.Response(200, json={"status": "ok", "sockets": 0})
    return httpx.Response(200, json={"status": "ok"})


@pytest.fixture
async def ops(bot_settings: BotSettings) -> AsyncIterator[Ops]:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_health)) as http:
        yield Ops(bot_settings, http)


async def _dead_lettered_payment(stack: Stack) -> tuple[str, dict[str, str]]:
    """A demo payment whose provider fails all three attempts; returns its task id and auth."""
    auth = await stack.sandbox()
    response = await stack.client.post(
        "/api/orders/42/pay", json=PAYMENT, headers={**auth, "X-Fault-Fail-Attempts": "3"}
    )
    await stack.finished_trace(response.headers["x-trace-id"])
    task_id: str = response.json()["task_id"]
    return task_id, auth


def _task_status(engine: Engine, task_id: str) -> str:
    """From the database: polling the API this often would run into its rate limit."""
    with engine.connect() as connection:
        status: str = connection.execute(
            text("SELECT status FROM orders.tasks WHERE id = :id"), {"id": task_id}
        ).scalar_one()
    return status


async def test_a_replayed_dead_letter_runs_again_and_succeeds(
    stack: Stack, ops: Ops, sync_engine: Engine
) -> None:
    task_id, _ = await _dead_lettered_payment(stack)
    assert _task_status(sync_engine, task_id) == "failed"
    before = await ops.dead_letters()
    [payments] = [queue for queue in before.queues if queue.kind == "charge"]
    assert payments.messages == 1
    [failed] = before.failures
    assert str(failed.task_id) == task_id
    assert failed.injected  # a visitor's fault injection, not an alert

    result = await ops.replay("charge")
    assert (result.queue, result.replayed, result.dropped) == ("test.jobs.payments.dlq", 1, 0)
    # The provider stub failed this payment three times; the fourth call goes through.
    deadline = time.monotonic() + 20
    while _task_status(sync_engine, task_id) != "succeeded":
        assert time.monotonic() < deadline, "the replayed task did not succeed"
        await asyncio.sleep(0.2)
    after = await ops.dead_letters()
    assert [queue.messages for queue in after.queues] == [0, 0]
    assert after.failures == ()


async def test_a_dead_letter_of_an_expired_sandbox_is_removed(
    stack: Stack, ops: Ops, sync_engine: Engine
) -> None:
    task_id, _ = await _dead_lettered_payment(stack)
    with sync_engine.begin() as connection:
        connection.execute(text("DELETE FROM orders.tasks WHERE id = :id"), {"id": task_id})
    result = await ops.replay("charge")
    assert (result.replayed, result.dropped) == (0, 1)
    assert [queue.messages for queue in (await ops.dead_letters()).queues] == [0, 0]


async def test_the_status_reads_every_part(event_stack: Stack, ops: Ops) -> None:
    auth = await event_stack.sandbox()
    response = await event_stack.client.post(
        "/api/orders",
        json={"product_id": "kb-7", "quantity": 1, "delivery": "standard"},
        headers=auth,
    )
    await event_stack.finished_trace(response.headers["x-trace-id"])

    report = await ops.status()
    assert report.unreadable == {}
    assert [service.ok for service in report.services] == [True, True, True]
    assert [service.detail for service in report.services] == ["ready", "ok", "0 open sockets"]
    work = {queue.name: queue for queue in report.queues if not queue.dead_letters}
    assert set(work) == {"test.jobs.reports", "test.jobs.payments"}
    assert all(queue.consumers >= 1 and queue.limit == 1000 for queue in work.values())
    assert report.outbox is not None
    assert report.outbox.unpublished == 0
    # Every group has handled the order's event (the trace was done).
    assert report.lag == {"inventory": 0, "analytics": 0, "notifications": 0}


async def test_a_part_that_cannot_be_read_is_reported_not_raised(
    bot_settings: BotSettings,
) -> None:
    offline = bot_settings.model_copy(
        update={"kafka_bootstrap": "127.0.0.1:1", "amqp_url": "amqp://u:p@127.0.0.1:1/none"}
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(_health)) as http:
        report = await Ops(offline, http).status()
    assert set(report.unreadable) == {"RabbitMQ", "Kafka"}
    assert report.queues == ()
    assert report.outbox is not None  # PostgreSQL still answers
