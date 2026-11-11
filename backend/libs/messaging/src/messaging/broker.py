"""The connection to RabbitMQ and confirmed publishing.

`publish_*` returns only after the broker has confirmed the message (publisher confirms), so a
job reported as queued is really on the queue. Refusals become `QueueUnavailable`: the API turns
them into 503 with `Retry-After`, the worker into a requeue of the message it was handling."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from aio_pika import DeliveryMode, Message, RobustConnection
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractRobustConnection
from aio_pika.connection import make_url
from aio_pika.exceptions import (
    CONNECTION_EXCEPTIONS,
    AMQPChannelError,
    DeliveryError,
    PublishError,
)

from contracts import ChargeJob, ReportJob
from messaging.topology import Topology

logger = logging.getLogger(__name__)

RECONNECT_DELAY_S = 2.0
CONNECT_TIMEOUT_S = 5.0


@dataclass(frozen=True)
class QueueDepth:
    name: str
    # Ready to be delivered (not counting messages a consumer holds unacknowledged).
    messages: int
    consumers: int


class QueueUnavailable(Exception):  # noqa: N818 — reads as the condition the caller handles
    """The broker cannot take the job now; try again in `retry_after_s` seconds."""

    def __init__(self, reason: str, retry_after_s: int = 5) -> None:
        super().__init__(reason)
        self.retry_after_s = retry_after_s


class QueueFull(QueueUnavailable):
    """The work queue is at its limit and the broker refused the job (backpressure)."""


def job_message(job: ReportJob | ChargeJob, headers: dict[str, str | int] | None = None) -> Message:
    return Message(
        job.model_dump_json().encode(),
        content_type="application/json",
        delivery_mode=DeliveryMode.PERSISTENT,
        message_id=str(job.task_id),
        type=job.kind,
        headers=dict(headers) if headers else None,
    )


class Broker:
    """One robust connection (it reconnects and restores channels by itself) and a confirming
    channel for publishing. `connect` retries until the broker answers, so a service can start
    first and serve everything that does not need the queue meanwhile."""

    def __init__(self, url: str, topology: Topology, *, publish_timeout_s: float = 3.0) -> None:
        self._url = url
        self.topology = topology
        self._publish_timeout_s = publish_timeout_s
        self._connection: AbstractRobustConnection | None = None
        self._channel: AbstractChannel | None = None
        self._exchange: AbstractExchange | None = None

    @property
    def ready(self) -> bool:
        return (
            self._connection is not None
            and not self._connection.is_closed
            and self._channel is not None
            and not self._channel.is_closed
        )

    @property
    def connection(self) -> AbstractRobustConnection:
        if self._connection is None:
            raise QueueUnavailable("not connected to the broker yet")
        return self._connection

    async def connect(self) -> None:
        """Connects and declares the topology, retrying until it works (cancel to give up)."""
        while self._connection is None:
            # Built here rather than with `connect_robust`: a robust connection runs its own
            # reconnect loop, which outlives a cancelled or failed first attempt and would keep
            # retrying forever. Closing the connection is what stops that loop.
            connection = RobustConnection(make_url(self._url))
            try:
                await connection.connect(timeout=CONNECT_TIMEOUT_S)
                channel = await connection.channel(publisher_confirms=True, on_return_raises=True)
                self._exchange = await self.topology.declare(channel)
            except AMQPChannelError:
                await connection.close()
                # The broker answered but refused the topology (e.g. a queue declared elsewhere
                # with other arguments): the message names the queue and the argument.
                logger.exception("Declaring the RabbitMQ topology failed")
            except CONNECTION_EXCEPTIONS as error:
                await connection.close()
                # Only the type: connection errors can carry the broker URL with its password.
                logger.warning(
                    "RabbitMQ is not reachable (%s); retrying in %.0f s",
                    type(error).__name__,
                    RECONNECT_DELAY_S,
                )
            except BaseException:
                await connection.close()  # cancelled: the service is stopping
                raise
            else:
                self._channel = channel
                self._connection = connection
                logger.info("Connected to RabbitMQ, topology declared")
                return
            await asyncio.sleep(RECONNECT_DELAY_S)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
        self._connection = self._channel = self._exchange = None

    async def depth(self, queue: str) -> QueueDepth:
        """How many messages wait in `queue` and how many consumers it has. A passive declare on
        its own channel: it changes nothing, and a missing queue closes only that channel."""
        channel = await self.connection.channel()
        try:
            declared = await channel.declare_queue(queue, passive=True)
            result = declared.declaration_result
            return QueueDepth(
                name=queue,
                messages=int(result.message_count or 0),
                consumers=int(result.consumer_count or 0),
            )
        finally:
            await channel.close()

    async def publish_job(self, job: ReportJob | ChargeJob) -> None:
        """A new job: to the jobs exchange, routed to its work queue."""
        if self._exchange is None or not self.ready:
            raise QueueUnavailable("not connected to the broker")
        await self._publish(self._exchange, self.topology.queue(job.kind).routing_key, job)

    async def publish_to_queue(
        self,
        queue: str,
        job: ReportJob | ChargeJob,
        headers: dict[str, str | int] | None = None,
    ) -> None:
        """Straight to a named queue through the default exchange (retry and dead-letter queues)."""
        if self._channel is None or not self.ready:
            raise QueueUnavailable("not connected to the broker")
        await self._publish(self._channel.default_exchange, queue, job, headers)

    async def _publish(
        self,
        exchange: AbstractExchange,
        routing_key: str,
        job: ReportJob | ChargeJob,
        headers: dict[str, str | int] | None = None,
    ) -> None:
        try:
            await exchange.publish(
                job_message(job, headers),
                routing_key=routing_key,
                mandatory=True,
                timeout=self._publish_timeout_s,
            )
        except DeliveryError as error:
            raise QueueFull(f"the broker refused the job ({routing_key} is full)") from error
        except PublishError as error:
            raise QueueUnavailable(f"no queue is bound for {routing_key!r}") from error
        except TimeoutError as error:
            raise QueueUnavailable("the broker did not confirm in time") from error
        except CONNECTION_EXCEPTIONS as error:
            raise QueueUnavailable(f"publishing failed: {type(error).__name__}") from error
