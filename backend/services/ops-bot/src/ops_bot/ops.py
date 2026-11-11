"""What the bot can do: read the state of the system, list the dead letters, replay them.

Everything here opens its own connections and closes them: the bot is used a few times a day, and
a webhook request runs in an event loop of its own. Every read is bounded in time."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Awaitable
from typing import Any

import httpx
from aio_pika.abc import AbstractIncomingMessage
from aio_pika.exceptions import AMQPError
from pydantic import HttpUrl, ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from contracts import JOB_ADAPTER, ORDER_EVENT_GROUPS, ORDER_EVENTS_TOPIC, JobKind
from messaging import Broker, QueueUnavailable, Topology
from messaging.kafka import KafkaError, consumer_lag
from ops_bot.report import (
    DeadLetters,
    FailedTask,
    OutboxState,
    QueueState,
    ReplayResult,
    ServiceHealth,
    StatusReport,
)
from ops_bot.settings import BotSettings

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_S = 3.0
PROBE_TIMEOUT_S = 6.0
REPLAY_TIMEOUT_S = 30.0
# Dead letters replayed per command; the rest wait for the next one.
REPLAY_LIMIT = 100
# Dead letters expire with their sandbox after 30 minutes: older failures are history.
FAILURE_WINDOW = "30 minutes"

# Errors that mean "this part cannot be read right now", never a bug.
_UNREADABLE = (TimeoutError, OSError, SQLAlchemyError, KafkaError, AMQPError)
# What a command can run into; the bot answers with the error's type.
OPS_FAILURES = (*_UNREADABLE, QueueUnavailable)

_OUTBOX = text(
    """
    SELECT count(*), extract(epoch FROM now() - min(created_at))
    FROM orders.outbox
    WHERE published_at IS NULL
    """
)

_FAILURES = text(
    f"""
    SELECT id, kind, coalesce(error, ''), attempts, extract(epoch FROM now() - updated_at),
           coalesce((params->>'fail_attempts')::int, 0) > 0
    FROM orders.tasks
    WHERE status = 'failed' AND updated_at > now() - interval '{FAILURE_WINDOW}'
    ORDER BY updated_at DESC
    LIMIT 20
    """  # noqa: S608 — a constant, no values
)

# Only a failed task of a live sandbox goes back: the row stays locked until the job is
# published, so a worker that takes it at once waits, then finds the task queued.
_RESET_TASK = text(
    """
    UPDATE orders.tasks
    SET status = 'queued', attempts = 0, error = NULL, result = NULL, updated_at = now()
    WHERE id = :id AND status = 'failed' AND expires_at > now()
    RETURNING id
    """
)


def _detail(response: httpx.Response) -> str:
    """A short reason from a health endpoint's answer."""
    try:
        body: Any = response.json()
    except ValueError:
        return f"HTTP {response.status_code}"
    if not isinstance(body, dict):
        return f"HTTP {response.status_code}"
    checks = body.get("checks")
    if isinstance(checks, dict):
        failing = [f"{name} {value}" for name, value in checks.items() if value != "ok"]
        return ", ".join(failing) or "ready"
    sockets = body.get("sockets")
    if isinstance(sockets, int):
        return f"{sockets} open socket{'' if sockets == 1 else 's'}"
    status = body.get("status")
    return str(status) if status else f"HTTP {response.status_code}"


class Ops:
    def __init__(self, settings: BotSettings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http
        self._topology = Topology(prefix=settings.queue_prefix)

    async def status(self) -> StatusReport:
        unreadable: dict[str, str] = {}
        services, queues, database, lag = await asyncio.gather(
            asyncio.gather(
                self._service("Orders API", self._settings.orders_api_url, "readyz"),
                self._service("Payments API", self._settings.payments_url, "healthz"),
                self._service("Realtime hub", self._settings.hub_url, "healthz"),
            ),
            self._read(unreadable, "RabbitMQ", self._queues(), ()),
            self._read(unreadable, "PostgreSQL", self._database(), (None, ())),
            self._read(unreadable, "Kafka", self._lag(), {}),
        )
        outbox, failures = database
        return StatusReport(
            services=tuple(services),
            queues=queues,
            outbox=outbox,
            lag=lag,
            failures=failures,
            unreadable=unreadable,
        )

    async def dead_letters(self) -> DeadLetters:
        unreadable: dict[str, str] = {}
        queues, database = await asyncio.gather(
            self._read(unreadable, "RabbitMQ", self._queues(), ()),
            self._read(unreadable, "PostgreSQL", self._database(), (None, ())),
        )
        return DeadLetters(
            queues=tuple(queue for queue in queues if queue.dead_letters),
            failures=database[1],
            unreadable=unreadable,
        )

    async def replay(self, kind: JobKind) -> ReplayResult:
        """Moves a kind's dead letters back to its work queue as first attempts. A dead letter
        whose task is gone (the sandbox expired) is removed instead."""
        name = self._topology.queue(kind).dead_letters
        replayed = dropped = 0
        async with (
            asyncio.timeout(REPLAY_TIMEOUT_S),
            self._broker() as broker,
            self._engine() as engine,
        ):
            channel = await broker.connection.channel()
            try:
                queue = await channel.declare_queue(name, passive=True)
                for _ in range(REPLAY_LIMIT):
                    message = await queue.get(no_ack=False, fail=False)
                    if message is None:
                        break
                    if await self._replay_one(broker, engine, message):
                        replayed += 1
                    else:
                        dropped += 1
            finally:
                await channel.close()
        logger.info("Replayed %d dead letter(s) of %s, dropped %d", replayed, name, dropped)
        return ReplayResult(queue=name, replayed=replayed, dropped=dropped)

    async def _replay_one(
        self, broker: Broker, engine: AsyncEngine, message: AbstractIncomingMessage
    ) -> bool:
        try:
            job = JOB_ADAPTER.validate_json(message.body)
        except ValidationError:
            logger.warning("Removing a malformed dead letter %s", message.message_id)
            await message.reject(requeue=False)
            return False
        try:
            async with engine.begin() as connection:
                reset = await connection.execute(_RESET_TASK, {"id": job.task_id})
                if reset.first() is None:
                    await message.ack()
                    return False
                await broker.publish_job(
                    job.model_copy(update={"attempt": 1, "enqueued_at": time.time()})
                )
        except Exception:
            # Nothing changed: the task is still failed, the dead letter goes back to its queue.
            await message.nack(requeue=True)
            raise
        await message.ack()
        return True

    async def _service(self, name: str, base: HttpUrl, path: str) -> ServiceHealth:
        try:
            response = await self._http.get(
                f"{str(base).rstrip('/')}/{path}", timeout=HTTP_TIMEOUT_S
            )
        except httpx.HTTPError as error:
            return ServiceHealth(name, ok=False, detail=f"unreachable ({type(error).__name__})")
        return ServiceHealth(
            name, ok=response.status_code == httpx.codes.OK, detail=_detail(response)
        )

    async def _queues(self) -> tuple[QueueState, ...]:
        states: list[QueueState] = []
        async with self._broker() as broker:
            for queue in self._topology.queues:
                for name, dead in ((queue.name, False), (queue.dead_letters, True)):
                    depth = await broker.depth(name)
                    states.append(
                        QueueState(
                            name=name,
                            kind=queue.kind,
                            dead_letters=dead,
                            messages=depth.messages,
                            consumers=depth.consumers,
                            limit=None if dead else self._topology.max_queued,
                        )
                    )
        return tuple(states)

    async def _database(self) -> tuple[OutboxState | None, tuple[FailedTask, ...]]:
        async with self._engine() as engine, engine.connect() as connection:
            row = (await connection.execute(_OUTBOX)).one()
            rows = (await connection.execute(_FAILURES)).all()
        count, oldest = row
        return (
            OutboxState(
                unpublished=int(count), oldest_s=float(oldest) if oldest is not None else None
            ),
            tuple(
                FailedTask(
                    task_id=task_id,
                    kind=str(kind),
                    error=str(error),
                    attempts=int(attempts),
                    age_s=float(age),
                    injected=bool(injected),
                )
                for task_id, kind, error, attempts, age, injected in rows
            ),
        )

    async def _lag(self) -> dict[str, int]:
        prefix = self._settings.queue_prefix
        lag = await consumer_lag(
            self._settings.kafka_bootstrap,
            f"{prefix}{ORDER_EVENTS_TOPIC}",
            [f"{prefix}{group}" for group in ORDER_EVENT_GROUPS],
        )
        return {group: lag[f"{prefix}{group}"] for group in ORDER_EVENT_GROUPS}

    @contextlib.asynccontextmanager
    async def _broker(self) -> AsyncIterator[Broker]:
        broker = Broker(str(self._settings.amqp_url), self._topology)
        try:
            await broker.connect()
            yield broker
        finally:
            await broker.close()

    @contextlib.asynccontextmanager
    async def _engine(self) -> AsyncIterator[AsyncEngine]:
        engine = create_async_engine(
            str(self._settings.database_url),
            pool_size=1,
            max_overflow=0,
            connect_args={"timeout": 5},
        )
        try:
            yield engine
        finally:
            await engine.dispose()

    @staticmethod
    async def _read[T](unreadable: dict[str, str], part: str, read: Awaitable[T], default: T) -> T:
        try:
            async with asyncio.timeout(PROBE_TIMEOUT_S):
                return await read
        except _UNREADABLE as error:
            unreadable[part] = type(error).__name__
            return default
