"""Alerts: what in a status report is a real problem, and which problems are new or resolved.

Only real problems alert the owner. The failures visitors ask for in the playground (fault
injection: a provider that fails, a dead-lettered demo payment, a provider that does not answer)
are expected; they show in /status and /dlq, but never wake anyone up. A per-sandbox circuit
breaker is not checked at all: opening it is the demo.

Alerts are edge-triggered: a problem is announced when it appears and once more when it is
resolved, not on every check. The book of open problems lives in Redis, so a restart of the bot
neither repeats them nor forgets them."""

from __future__ import annotations

import json
from dataclasses import dataclass

from redis.asyncio import Redis

from ops_bot.report import StatusReport, describe_age
from ops_bot.settings import BotSettings

ALERTS_KEY = "ops-bot:alerts"


def _text(value: bytes | str) -> str:
    return value.decode() if isinstance(value, bytes) else value


@dataclass(frozen=True)
class Problem:
    key: str
    text: str
    # A condition is resolved when it clears and the owner hears so; an event (a task that went
    # to the dead-letter queue) is only announced.
    resolves: bool = True


def find_problems(report: StatusReport, settings: BotSettings) -> list[Problem]:
    problems: list[Problem] = []
    for service in report.services:
        if not service.ok:
            problems.append(
                Problem(f"service:{service.name}", f"{service.name} is down: {service.detail}")
            )
    for part, reason in report.unreadable.items():
        problems.append(Problem(f"unreadable:{part}", f"Cannot read {part}: {reason}"))
    for queue in report.queues:
        if queue.dead_letters:
            continue
        if queue.consumers == 0:
            problems.append(Problem(f"consumers:{queue.name}", f"No worker consumes {queue.name}"))
        if queue.limit and queue.messages >= settings.queue_fill_alert * queue.limit:
            problems.append(
                Problem(
                    f"capacity:{queue.name}",
                    f"{queue.name} holds {queue.messages} of {queue.limit} jobs: close to "
                    "refusing new ones",
                )
            )
    outbox = report.outbox
    if outbox and outbox.oldest_s is not None and outbox.oldest_s >= settings.outbox_stuck_seconds:
        problems.append(
            Problem(
                "outbox",
                f"{outbox.unpublished} event(s) stuck in the outbox, the oldest for "
                f"{describe_age(outbox.oldest_s)}: is the relay or Kafka down?",
            )
        )
    for group, behind in report.lag.items():
        if behind >= settings.lag_alert:
            problems.append(
                Problem(f"lag:{group}", f"Consumer group {group} is {behind} events behind")
            )
    for task in report.failures:
        if not task.injected:
            problems.append(
                Problem(
                    f"dead-letter:{task.task_id}",
                    f"Task {str(task.task_id)[:8]} ({task.kind}) went to the dead-letter queue "
                    f"after {task.attempts} attempt(s): {task.error or 'no reason recorded'}",
                    resolves=False,
                )
            )
    return problems


@dataclass(frozen=True)
class Changes:
    raised: list[Problem]
    # Texts of the conditions that cleared.
    resolved: list[str]

    def __bool__(self) -> bool:
        return bool(self.raised or self.resolved)


class AlertBook:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def diff(self, problems: list[Problem]) -> Changes:
        """What is new and what cleared since the problems were last recorded."""
        stored = await self._stored()
        current = {problem.key: problem for problem in problems}
        resolved: list[str] = []
        for key, raw in stored.items():
            if key in current:
                continue
            entry = json.loads(raw)
            if entry.get("resolves", True):
                resolved.append(str(entry.get("text", key)))
        return Changes(
            raised=[problem for key, problem in current.items() if key not in stored],
            resolved=resolved,
        )

    async def record(self, problems: list[Problem]) -> None:
        """Remembers the current problems: called once the owner has heard about them, so a
        message that could not be sent is tried again at the next check."""
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.delete(ALERTS_KEY)
            if problems:
                pipe.hset(
                    ALERTS_KEY,
                    mapping={
                        problem.key: json.dumps(
                            {"text": problem.text, "resolves": problem.resolves}
                        )
                        for problem in problems
                    },
                )
            await pipe.execute()

    async def _stored(self) -> dict[str, str]:
        raw = await self._redis.hgetall(ALERTS_KEY)
        return {_text(key): _text(value) for key, value in raw.items()}

    async def open_problems(self) -> list[str]:
        stored = await self._stored()
        return [str(json.loads(raw).get("text", key)) for key, raw in sorted(stored.items())]
