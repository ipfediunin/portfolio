"""Which states of the system alert the owner, and that an alert is said once: when the problem
appears and when it clears."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from dataclasses import replace

import pytest
from redis.asyncio import Redis

from ops_bot.alerts import AlertBook, find_problems
from ops_bot.report import FailedTask, OutboxState, ServiceHealth, StatusReport
from ops_bot.runner import watch
from ops_bot.settings import BotSettings
from ops_fixtures import HEALTHY, INJECTED_FAILURE, FakeOps, with_queue


def _settings() -> BotSettings:
    return BotSettings.model_validate(
        {
            "database_url": "postgresql://u:p@localhost:5432/db",
            "redis_url": "redis://localhost:6379/0",
            "amqp_url": "amqp://u:p@localhost:5672/v",
        }
    )


def _keys(report: StatusReport) -> list[str]:
    return [problem.key for problem in find_problems(report, _settings())]


def test_a_healthy_system_and_the_visitors_demo_failures_raise_nothing() -> None:
    assert _keys(HEALTHY) == []


def test_real_problems_raise_alerts() -> None:
    down = replace(
        HEALTHY,
        services=(ServiceHealth("Orders API", ok=False, detail="postgres unavailable"),),
    )
    assert _keys(down) == ["service:Orders API"]
    assert _keys(with_queue(HEALTHY, "jobs.payments", consumers=0)) == ["consumers:jobs.payments"]
    assert _keys(with_queue(HEALTHY, "jobs.reports", messages=800)) == ["capacity:jobs.reports"]
    stuck = replace(HEALTHY, outbox=OutboxState(unpublished=4, oldest_s=95.0))
    [problem] = find_problems(stuck, _settings())
    assert problem.text == (
        "4 event(s) stuck in the outbox, the oldest for 95 s: is the relay or Kafka down?"
    )
    behind = replace(HEALTHY, lag={"inventory": 0, "analytics": 250, "notifications": 0})
    assert _keys(behind) == ["lag:analytics"]
    blind = replace(HEALTHY, unreadable={"Kafka": "KafkaConnectionError"})
    assert _keys(blind) == ["unreadable:Kafka"]


def test_a_job_that_failed_for_real_is_an_event_not_a_condition() -> None:
    real = FailedTask(
        task_id=uuid.uuid4(),
        kind="report",
        error="unexpected KeyError",
        attempts=1,
        age_s=5.0,
        injected=False,
    )
    report = replace(HEALTHY, failures=(INJECTED_FAILURE, real))
    [problem] = find_problems(report, _settings())
    assert problem.key == f"dead-letter:{real.task_id}"
    assert not problem.resolves
    assert "after 1 attempt(s): unexpected KeyError" in problem.text


@pytest.fixture
async def redis(bot_settings: BotSettings) -> AsyncIterator[Redis]:
    client = Redis.from_url(str(bot_settings.redis_url), decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


async def _one_check(ops: FakeOps, book: AlertBook, settings: BotSettings) -> list[str]:
    """Runs the watcher for one check; returns what it told the owner."""
    told: list[str] = []
    stop = asyncio.Event()

    async def tell(text: str) -> None:
        told.append(text)

    async def stop_after_one() -> None:
        await asyncio.sleep(0.3)
        stop.set()

    await asyncio.gather(watch(ops, book, settings, tell, stop), stop_after_one())
    return told


@pytest.mark.integration
async def test_an_alert_is_said_when_it_appears_and_when_it_clears(
    bot_settings: BotSettings, redis: Redis
) -> None:
    book = AlertBook(redis)
    ops = FakeOps(with_queue(HEALTHY, "jobs.payments", consumers=0))
    assert await _one_check(ops, book, bot_settings) == ["⚠️ No worker consumes jobs.payments"]
    assert await _one_check(ops, book, bot_settings) == []  # still open: not repeated
    assert await book.open_problems() == ["No worker consumes jobs.payments"]

    ops.report = HEALTHY
    assert await _one_check(ops, book, bot_settings) == [
        "✅ Resolved: No worker consumes jobs.payments"
    ]
    assert await book.open_problems() == []


@pytest.mark.integration
async def test_a_dead_letter_event_is_announced_once_and_never_resolved(
    bot_settings: BotSettings, redis: Redis
) -> None:
    book = AlertBook(redis)
    real = replace(INJECTED_FAILURE, task_id=uuid.uuid4(), injected=False)
    ops = FakeOps(replace(HEALTHY, failures=(real,)))
    [told] = await _one_check(ops, book, bot_settings)
    assert told.startswith(f"⚠️ Task {str(real.task_id)[:8]} (charge) went to the dead-letter")
    ops.report = HEALTHY  # out of the 30-minute window
    assert await _one_check(ops, book, bot_settings) == []
