"""Reports and a stand-in for the system, for the ops bot's tests of what it says and when."""

from __future__ import annotations

import uuid
from dataclasses import replace

from contracts import JobKind
from ops_bot.report import (
    DeadLetters,
    FailedTask,
    OutboxState,
    QueueState,
    ReplayResult,
    ServiceHealth,
    StatusReport,
)

INJECTED_FAILURE = FailedTask(
    task_id=uuid.UUID("6f1c2a52-0d3c-4bb2-9a7e-1d9f7c2a1b10"),
    kind="charge",
    error="the provider answered 503",
    attempts=3,
    age_s=40.0,
    injected=True,
)

HEALTHY = StatusReport(
    services=(
        ServiceHealth("Orders API", ok=True, detail="ready"),
        ServiceHealth("Payments API", ok=True, detail="ok"),
        ServiceHealth("Realtime hub", ok=True, detail="1 open socket"),
    ),
    queues=(
        QueueState(
            "jobs.reports", "report", dead_letters=False, messages=0, consumers=2, limit=1000
        ),
        QueueState(
            "jobs.reports.dlq", "report", dead_letters=True, messages=0, consumers=0, limit=None
        ),
        QueueState(
            "jobs.payments", "charge", dead_letters=False, messages=0, consumers=2, limit=1000
        ),
        QueueState(
            "jobs.payments.dlq", "charge", dead_letters=True, messages=2, consumers=0, limit=None
        ),
    ),
    outbox=OutboxState(unpublished=0, oldest_s=None),
    lag={"inventory": 0, "analytics": 0, "notifications": 0},
    # A visitor's demo payment that failed on purpose: no problem.
    failures=(INJECTED_FAILURE,),
)


def with_queue(
    report: StatusReport,
    name: str,
    *,
    messages: int | None = None,
    consumers: int | None = None,
) -> StatusReport:
    """The report with one queue changed."""
    queues = tuple(
        replace(
            queue,
            messages=queue.messages if messages is None else messages,
            consumers=queue.consumers if consumers is None else consumers,
        )
        if queue.name == name
        else queue
        for queue in report.queues
    )
    return replace(report, queues=queues)


class FakeOps:
    """The system as the bot sees it, without connections."""

    def __init__(self, report: StatusReport = HEALTHY) -> None:
        self.report = report
        self.replayed: list[JobKind] = []
        self.replay_error: Exception | None = None

    async def status(self) -> StatusReport:
        return self.report

    async def dead_letters(self) -> DeadLetters:
        return DeadLetters(
            queues=tuple(queue for queue in self.report.queues if queue.dead_letters),
            failures=self.report.failures,
        )

    async def replay(self, kind: JobKind) -> ReplayResult:
        if self.replay_error is not None:
            raise self.replay_error
        self.replayed.append(kind)
        return ReplayResult(queue="jobs.payments.dlq", replayed=2, dropped=0)
