"""Exchanges and queues of the job system, and the retry policy they are shaped by."""

from __future__ import annotations

from dataclasses import dataclass, field

from aio_pika import ExchangeType
from aio_pika.abc import AbstractChannel, AbstractExchange

from contracts import JobKind

# Queued jobs and dead letters belong to sandboxes, which live 30 minutes.
JOB_TTL_MS = 30 * 60 * 1000
# A message that keeps crashing workers (not one that fails cleanly) goes to the DLQ after this.
DELIVERY_LIMIT = 5
DEAD_LETTER_CAPACITY = 10_000


@dataclass(frozen=True)
class RetryPolicy:
    """Exponential backoff: after attempt n fails, wait `base_delay_ms * 2**(n-1)`."""

    max_attempts: int = 3
    base_delay_ms: int = 1000

    def __post_init__(self) -> None:
        if self.max_attempts < 1 or self.base_delay_ms < 1:
            raise ValueError("A retry policy needs at least one attempt and a positive delay")

    def delay_after(self, attempt: int) -> int | None:
        """Delay before the next attempt, or None when `attempt` was the last one."""
        if attempt >= self.max_attempts:
            return None
        return int(self.base_delay_ms * 2 ** (attempt - 1))

    @property
    def delays_ms(self) -> tuple[int, ...]:
        return tuple(self.base_delay_ms * 2**index for index in range(self.max_attempts - 1))


@dataclass(frozen=True)
class JobQueue:
    kind: JobKind
    name: str
    routing_key: str

    def retry_queue(self, delay_ms: int) -> str:
        return f"{self.name}.retry.{delay_ms}ms"

    @property
    def dead_letters(self) -> str:
        return f"{self.name}.dlq"


@dataclass(frozen=True)
class Topology:
    """Names and arguments of everything the job system declares. `prefix` separates test runs
    from the real queues on the same broker."""

    prefix: str = ""
    retry: RetryPolicy = field(default_factory=RetryPolicy)
    # Per work queue: beyond it the broker refuses new jobs (backpressure).
    max_queued: int = 1000
    job_ttl_ms: int = JOB_TTL_MS

    @property
    def exchange(self) -> str:
        return f"{self.prefix}jobs"

    @property
    def queues(self) -> tuple[JobQueue, ...]:
        return (
            JobQueue("report", f"{self.prefix}jobs.reports", "reports"),
            JobQueue("charge", f"{self.prefix}jobs.payments", "payments"),
        )

    def queue(self, kind: JobKind) -> JobQueue:
        return next(queue for queue in self.queues if queue.kind == kind)

    async def declare(self, channel: AbstractChannel) -> AbstractExchange:
        """Declares everything (idempotent) and returns the exchange jobs are published to."""
        exchange = await channel.declare_exchange(self.exchange, ExchangeType.DIRECT, durable=True)
        for queue in self.queues:
            await channel.declare_queue(
                queue.dead_letters,
                durable=True,
                arguments={
                    "x-queue-type": "quorum",
                    "x-message-ttl": self.job_ttl_ms,
                    "x-max-length": DEAD_LETTER_CAPACITY,
                    "x-overflow": "drop-head",
                },
            )
            work = await channel.declare_queue(
                queue.name,
                durable=True,
                arguments={
                    "x-queue-type": "quorum",
                    "x-max-length": self.max_queued,
                    "x-overflow": "reject-publish",
                    "x-message-ttl": self.job_ttl_ms,
                    "x-delivery-limit": DELIVERY_LIMIT,
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": queue.dead_letters,
                    "x-dead-letter-strategy": "at-least-once",
                },
            )
            await work.bind(exchange, routing_key=queue.routing_key)
            for delay_ms in self.retry.delays_ms:
                await channel.declare_queue(
                    queue.retry_queue(delay_ms),
                    durable=True,
                    arguments={
                        "x-queue-type": "quorum",
                        "x-message-ttl": delay_ms,
                        "x-overflow": "reject-publish",
                        "x-dead-letter-exchange": "",
                        "x-dead-letter-routing-key": queue.name,
                        "x-dead-letter-strategy": "at-least-once",
                    },
                )
        return exchange
