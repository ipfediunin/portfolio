"""The outbox relay (`orders-api-relay`, its own container): publishes the events the Orders API
wrote into `orders.outbox` to Kafka, in order, and marks them published.

Rows are claimed with `FOR UPDATE SKIP LOCKED`, so several relays can run without publishing the
same row twice at the same moment; the claim, the publishes and the mark are one transaction. If
Kafka refuses mid-batch the transaction rolls back and the batch is published again later: delivery
is at-least-once, and consumers recognise a repeated event by its id.

Each publish is traced into the request that created the event (its trace id travels in the
payload), so the city shows the event leaving for Kafka. The spans are stored once the batch is
marked published: a batch that rolled back and goes out again is traced once."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import signal
import time
from typing import Any, Protocol

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from contracts import (
    ORDER_EVENT_TRACE_PARTS,
    ORDER_EVENTS_PARTITIONS,
    ORDER_EVENTS_TOPIC,
    TraceSpan,
)
from messaging.kafka import EventProducer, KafkaError, Published, ensure_topic
from orders_api.settings import Settings, get_settings
from telemetry import SpanRecorder, configure_logging, current_trace, span
from telemetry.background import BackgroundTraces
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

SERVICE_NAME = "outbox-relay"
BATCH = 100
RETRY_SECONDS = 2.0

_CLAIM = text(
    """
    SELECT id, topic, key, payload
    FROM orders.outbox
    WHERE published_at IS NULL
    ORDER BY id
    LIMIT :limit
    FOR UPDATE SKIP LOCKED
    """
)
_MARK_PUBLISHED = text("UPDATE orders.outbox SET published_at = now() WHERE id = ANY(:ids)")


class EventPublisher(Protocol):
    """What the relay needs from Kafka (`messaging.kafka.EventProducer`)."""

    async def publish(self, topic: str, key: str, value: bytes) -> Published: ...


class OutboxRelay:
    def __init__(
        self, engine: AsyncEngine, producer: EventPublisher, traces: BackgroundTraces
    ) -> None:
        self._engine = engine
        self._producer = producer
        self._traces = traces

    async def relay_once(self) -> int:
        """Publishes one batch; returns how many events went out."""
        traced: list[tuple[str, list[TraceSpan]]] = []
        async with self._engine.begin() as connection:
            rows = (await connection.execute(_CLAIM, {"limit": BATCH})).mappings().all()
            for row in rows:
                traced.append(await self._publish(row))
            if rows:
                await connection.execute(_MARK_PUBLISHED, {"ids": [row["id"] for row in rows]})
        for trace_id, spans in traced:
            if trace_id:
                await self._traces.append(trace_id, spans)
                await self._traces.finish_part(trace_id, ORDER_EVENT_TRACE_PARTS)
        return len(rows)

    async def _publish(self, row: RowMapping) -> tuple[str, list[TraceSpan]]:
        """Publishes one event; returns its trace id and the span of the publish."""
        payload: dict[str, Any] = row["payload"]
        trace_id = str(payload.get("trace_id", ""))
        started_at = float(payload.get("trace_started_at", time.time()))
        recorder = SpanRecorder(trace_id, SERVICE_NAME, origin_ms=(time.time() - started_at) * 1000)
        token = current_trace.set(recorder)
        try:
            async with span("publish", f"produce {row['topic']} (acks=all)") as step:
                published = await self._producer.publish(
                    row["topic"], row["key"], json.dumps(payload).encode()
                )
                step.attributes.update(
                    {
                        "partition": published.partition,
                        "offset": published.offset,
                        "key": row["key"],
                    }
                )
        finally:
            current_trace.reset(token)
        return trace_id, recorder.drain()

    async def run(self, stop: asyncio.Event, poll_seconds: float) -> None:
        while not stop.is_set():
            try:
                published = await self.relay_once()
            except (KafkaError, SQLAlchemyError, OSError):
                logger.warning("Relaying failed; the batch stays unpublished", exc_info=True)
                published = 0
                await _wait(stop, RETRY_SECONDS)
                continue
            if published:
                logger.info("Published %d event(s)", published)
            else:
                await _wait(stop, poll_seconds)


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    """Sleeps, unless the relay is told to stop meanwhile."""
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


async def start_producer(settings: Settings) -> EventProducer:
    """Creates the topic if needed and connects, retrying until Kafka answers."""
    topic = f"{settings.queue_prefix}{ORDER_EVENTS_TOPIC}"
    while True:
        producer = EventProducer(settings.kafka_bootstrap)
        try:
            await ensure_topic(settings.kafka_bootstrap, topic, ORDER_EVENTS_PARTITIONS)
            await producer.start()
        except (KafkaError, OSError) as error:
            await producer.stop()
            logger.warning(
                "Kafka is not reachable (%s); retrying in %.0f s",
                type(error).__name__,
                RETRY_SECONDS,
            )
            await asyncio.sleep(RETRY_SECONDS)
            continue
        return producer


async def _serve(settings: Settings) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        # Not available on Windows event loops; there Ctrl+C cancels the run instead.
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(signum, stop.set)
    engine = create_async_engine(str(settings.database_url), pool_size=2, max_overflow=0)
    redis = connect_redis(str(settings.redis_url))
    producer = await start_producer(settings)
    try:
        relay = OutboxRelay(engine, producer, BackgroundTraces(redis, settings.trace_ttl_seconds))
        logger.info("Relaying the outbox to Kafka")
        await relay.run(stop, settings.relay_poll_seconds)
    finally:
        await producer.stop()
        await redis.aclose()
        await engine.dispose()


def run() -> None:
    settings = get_settings()
    configure_logging(SERVICE_NAME, settings.log_level)
    asyncio.run(_serve(settings))
