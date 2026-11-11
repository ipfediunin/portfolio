"""The consumer groups of `orders.events`. Each group reads the whole topic on its own, at its own
pace, and does its own work with an event:

- inventory      — reserves the ordered stock (PostgreSQL),
- analytics      — counts the sale in the day's figures (PostgreSQL),
- notifications  — files a notification for the sandbox and publishes it to the realtime hub,
                   which pushes it to the page over WebSocket (Redis).

Every worker replica runs a member of every group, so Kafka spreads a group's partitions over the
replicas and rebalances when one stops. Handling is idempotent: marking an event as handled and
doing the work are one statement (or one Redis script), so a redelivered event changes nothing.
The offset is committed only after the work."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import ValidationError
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from contracts import ORDER_EVENT_GROUPS, ORDER_EVENT_TRACE_PARTS, Notification, OrderCreated
from messaging.kafka import EventConsumer, EventRecord, KafkaError
from messaging.notifications import NOTIFY_OPERATION, Notifier
from order_worker.failures import TransientFailure
from order_worker.repository import UNAVAILABLE, DatabaseUnavailable
from telemetry import SpanRecorder, current_trace, span
from telemetry.background import BackgroundTraces

logger = logging.getLogger(__name__)

SERVICE_NAME = "order-worker"
RETRY_SECONDS = 1.0

_RESERVE = text(
    """
    WITH first AS (
        INSERT INTO orders.processed_events (consumer_group, event_id)
        VALUES ('inventory', CAST(:event_id AS uuid))
        ON CONFLICT DO NOTHING
        RETURNING event_id
    )
    INSERT INTO orders.reservations (order_id, product_id, quantity)
    SELECT CAST(:order_id AS bigint), CAST(:product_id AS text), CAST(:quantity AS smallint)
    FROM first
    ON CONFLICT (order_id) DO NOTHING
    RETURNING order_id
    """
)

_COUNT_SALE = text(
    """
    WITH first AS (
        INSERT INTO orders.processed_events (consumer_group, event_id)
        VALUES ('analytics', CAST(:event_id AS uuid))
        ON CONFLICT DO NOTHING
        RETURNING event_id
    )
    INSERT INTO orders.daily_sales AS s (day, product_id, orders, quantity, revenue_cents)
    SELECT CAST(:day AS date), CAST(:product_id AS text), 1, CAST(:quantity AS integer),
           CAST(:revenue AS bigint)
    FROM first
    ON CONFLICT (day, product_id) DO UPDATE
        SET orders = s.orders + 1, quantity = s.quantity + EXCLUDED.quantity,
            revenue_cents = s.revenue_cents + EXCLUDED.revenue_cents
    RETURNING s.orders
    """
)


# Outlines of the statements for the trace (the full text is cut at 200 characters): marking the
# event as handled and the work are one statement, so a repeated event does nothing.
_HANDLED_ONCE = "WITH first AS (INSERT INTO orders.processed_events … ON CONFLICT DO NOTHING)"
_RESERVE_OUTLINE = f"{_HANDLED_ONCE} INSERT INTO orders.reservations … FROM first"
_COUNT_SALE_OUTLINE = (
    f"{_HANDLED_ONCE} INSERT INTO orders.daily_sales … FROM first ON CONFLICT DO UPDATE"
)


class OrderEventHandlers:
    """What each group does with an `order.created`. Each returns False for a repeat."""

    def __init__(self, engine: AsyncEngine, notifier: Notifier) -> None:
        self._engine = engine
        self._notifier = notifier

    def for_group(self, group: str) -> Callable[[OrderCreated], Awaitable[bool]]:
        handlers: dict[str, Callable[[OrderCreated], Awaitable[bool]]] = {
            "inventory": self.reserve_stock,
            "analytics": self.count_sale,
            "notifications": self.queue_notification,
        }
        return handlers[group]

    async def reserve_stock(self, event: OrderCreated) -> bool:
        params = {
            "event_id": event.event_id,
            "order_id": event.order_id,
            "product_id": event.product_id,
            "quantity": event.quantity,
        }
        return await self._execute(_RESERVE, _RESERVE_OUTLINE, params)

    async def count_sale(self, event: OrderCreated) -> bool:
        params = {
            "event_id": event.event_id,
            "day": event.occurred_at.date(),
            "product_id": event.product_id,
            "quantity": event.quantity,
            "revenue": event.total_cents,
        }
        return await self._execute(_COUNT_SALE, _COUNT_SALE_OUTLINE, params)

    async def queue_notification(self, event: OrderCreated) -> bool:
        notification = Notification(
            event="order.created",
            order_id=event.order_id,
            trace_id=event.trace_id,
            trace_started_at=event.trace_started_at,
            at=event.occurred_at,
        )
        try:
            async with span("notify", NOTIFY_OPERATION) as step:
                step.attributes["event"] = notification.event
                return await self._notifier.notify(
                    event.owner_key, notification, once=f"event:{event.event_id}"
                )
        except (RedisError, OSError) as error:
            raise TransientFailure("Redis is not available") from error

    async def _execute(self, statement: Any, outline: str, params: dict[str, Any]) -> bool:
        try:
            async with span("db", outline), self._engine.begin() as connection:
                return (await connection.execute(statement, params)).first() is not None
        except UNAVAILABLE as error:
            raise DatabaseUnavailable("PostgreSQL is not available") from error


class GroupConsumer:
    """One member of one consumer group."""

    def __init__(
        self,
        consumer: EventConsumer,
        group: str,
        handle: Callable[[OrderCreated], Awaitable[bool]],
        traces: BackgroundTraces,
        *,
        worker_name: str,
    ) -> None:
        self._consumer = consumer
        self._group = group
        self._handle = handle
        self._traces = traces
        self._worker_name = worker_name

    async def run(self) -> None:
        async for record in self._consumer.records():
            await self._process(record)
            await self._consumer.commit()

    async def _process(self, record: EventRecord) -> None:
        try:
            event = OrderCreated.model_validate_json(record.value)
        except ValidationError:
            # A malformed event cannot become valid by retrying: logged and skipped.
            logger.exception(
                "Skipping a malformed event at %s/%d@%d",
                record.topic,
                record.partition,
                record.offset,
            )
            return
        recorder = SpanRecorder(
            event.trace_id, SERVICE_NAME, origin_ms=(time.time() - event.trace_started_at) * 1000
        )
        token = current_trace.set(recorder)
        try:
            with span(
                "consume",
                f"consume {record.topic} [{self._group}] p{record.partition}",
            ) as taken:
                taken.attributes.update(
                    {
                        "group": self._group,
                        "partition": record.partition,
                        "offset": record.offset,
                        "worker": self._worker_name,
                    }
                )
            new = await self._handle_until_done(event)
        finally:
            current_trace.reset(token)
        # The groups work at the same time; the tag tells whose step each span is.
        spans = [
            item.model_copy(update={"attributes": {**item.attributes, "group": self._group}})
            for item in recorder.drain()
        ]
        await self._traces.append(event.trace_id, spans)
        if new:
            await self._traces.finish_part(event.trace_id, ORDER_EVENT_TRACE_PARTS)

    async def _handle_until_done(self, event: OrderCreated) -> bool:
        """Retries an outage until it passes: the partition waits, so events stay in order."""
        while True:
            try:
                return await self._handle(event)
            except IntegrityError:
                # The order is gone (its sandbox expired before the event was read).
                logger.warning("Event %s refers to a deleted order; skipped", event.event_id)
                return False
            except TransientFailure:
                logger.warning(
                    "[%s] event %s: a dependency is down; retrying", self._group, event.event_id
                )
                await asyncio.sleep(RETRY_SECONDS)


async def run_event_consumers(
    bootstrap: str,
    topic: str,
    group_prefix: str,
    handlers: OrderEventHandlers,
    traces: BackgroundTraces,
    *,
    worker_name: str,
    stop: asyncio.Event,
) -> None:
    """Runs a member of every group until `stop` is set."""
    members: list[tuple[EventConsumer, GroupConsumer]] = []
    for group in ORDER_EVENT_GROUPS:
        consumer = EventConsumer(bootstrap, topic, f"{group_prefix}{group}")
        members.append(
            (
                consumer,
                GroupConsumer(
                    consumer, group, handlers.for_group(group), traces, worker_name=worker_name
                ),
            )
        )
    started: list[EventConsumer] = []
    try:
        for consumer, _ in members:
            await consumer.start()
            started.append(consumer)
        tasks = [asyncio.create_task(member.run()) for _, member in members]
        logger.info("Consuming %s as %s", topic, ", ".join(ORDER_EVENT_GROUPS))
        stopping = asyncio.create_task(stop.wait())
        done, _ = await asyncio.wait([stopping, *tasks], return_when=asyncio.FIRST_COMPLETED)
        for task in [stopping, *tasks]:
            task.cancel()
        await asyncio.gather(stopping, *tasks, return_exceptions=True)
        for task in done:
            if task is not stopping and task.exception() is not None:
                raise RuntimeError("An event consumer stopped") from task.exception()
    except KafkaError:
        logger.exception("Kafka failed under the event consumers")
        raise
    finally:
        for consumer in started:
            await consumer.stop()
