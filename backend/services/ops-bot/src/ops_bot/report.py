"""What the bot knows about the system at one moment. Every part is read independently: a part
that cannot be read is listed in `unreadable` instead of failing the whole report."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from uuid import UUID

from contracts import JobKind

_MINUTES_FROM_S = 120
_HOURS_FROM_S = 7200


def describe_age(seconds: float) -> str:
    """`45 s`, `12 min`, `3 h`."""
    if seconds < _MINUTES_FROM_S:
        return f"{seconds:.0f} s"
    if seconds < _HOURS_FROM_S:
        return f"{seconds / 60:.0f} min"
    return f"{seconds / 3600:.0f} h"


@dataclass(frozen=True)
class ServiceHealth:
    name: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class QueueState:
    name: str
    kind: JobKind
    dead_letters: bool
    messages: int
    consumers: int
    # Work queues refuse new jobs past it (backpressure); dead-letter queues have none.
    limit: int | None


@dataclass(frozen=True)
class OutboxState:
    unpublished: int
    oldest_s: float | None


@dataclass(frozen=True)
class FailedTask:
    """A task that ended in the dead-letter queue recently."""

    task_id: UUID
    kind: str
    error: str
    attempts: int
    age_s: float
    # A visitor asked for the failures (the playground's fault injection): expected, not a problem.
    injected: bool


@dataclass(frozen=True)
class StatusReport:
    services: tuple[ServiceHealth, ...]
    queues: tuple[QueueState, ...] = ()
    outbox: OutboxState | None = None
    # Consumer group → events not handled yet.
    lag: Mapping[str, int] = field(default_factory=dict)
    failures: tuple[FailedTask, ...] = ()
    # Part → why it could not be read ("RabbitMQ" → "TimeoutError").
    unreadable: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class DeadLetters:
    queues: tuple[QueueState, ...]
    failures: tuple[FailedTask, ...]
    unreadable: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ReplayResult:
    queue: str
    # Back on the work queue, the task reset to `queued`.
    replayed: int
    # Their task is gone (the sandbox expired) or no longer failed: removed from the queue.
    dropped: int
