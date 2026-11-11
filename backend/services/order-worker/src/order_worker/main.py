"""`order-worker` command: connects to RabbitMQ, Kafka, PostgreSQL, Redis and the payment provider;
consumes jobs and order events until SIGTERM (then finishes the running work and exits)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx
from sqlalchemy.ext.asyncio import create_async_engine

from contracts import ORDER_EVENTS_PARTITIONS, ORDER_EVENTS_TOPIC
from messaging import Broker, Topology
from messaging.kafka import KafkaError, ensure_topic
from messaging.notifications import Notifier
from order_worker.events import OrderEventHandlers, run_event_consumers
from order_worker.handlers import Handlers
from order_worker.provider import ProviderClient
from order_worker.repository import WorkerRepository
from order_worker.settings import WorkerSettings
from order_worker.worker import SERVICE_NAME, JobWorker
from telemetry import configure_logging
from telemetry.background import BackgroundTraces
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

# Before the event consumers try Kafka again after it failed.
EVENTS_RETRY_SECONDS = 2.0


@dataclass(frozen=True)
class Worker:
    """A worker process: RabbitMQ jobs and the Kafka consumer groups, side by side."""

    settings: WorkerSettings
    jobs: JobWorker
    events: OrderEventHandlers
    traces: BackgroundTraces

    async def run(self, stop: asyncio.Event, *, grace_seconds: float) -> None:
        await asyncio.gather(
            self.jobs.run(stop, grace_seconds=grace_seconds), self.run_events(stop)
        )

    async def run_events(self, stop: asyncio.Event) -> None:
        """The consumer groups, restarted when Kafka fails: jobs keep running meanwhile."""
        topic = f"{self.settings.queue_prefix}{ORDER_EVENTS_TOPIC}"
        bootstrap = self.settings.kafka_bootstrap
        while not stop.is_set():
            try:
                await ensure_topic(bootstrap, topic, ORDER_EVENTS_PARTITIONS)
                await run_event_consumers(
                    bootstrap,
                    topic,
                    self.settings.queue_prefix,
                    self.events,
                    self.traces,
                    worker_name=self.settings.name,
                    stop=stop,
                )
            except (KafkaError, OSError, RuntimeError):
                logger.warning(
                    "Event consumers stopped; restarting in %.0f s",
                    EVENTS_RETRY_SECONDS,
                    exc_info=True,
                )
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=EVENTS_RETRY_SECONDS)


@contextlib.asynccontextmanager
async def open_worker(
    settings: WorkerSettings,
    *,
    topology: Topology | None = None,
    provider_transport: httpx.AsyncBaseTransport | None = None,
) -> AsyncIterator[Worker]:
    """Everything a worker needs, opened and closed together. Tests pass their own topology
    (prefixed queues) and a transport that talks to the provider stub in-process."""
    broker = Broker(str(settings.amqp_url), topology or Topology(prefix=settings.queue_prefix))
    redis = connect_redis(str(settings.redis_url))
    engine = create_async_engine(str(settings.database_url), pool_size=5, max_overflow=0)
    http = httpx.AsyncClient(
        base_url=str(settings.provider_url),
        timeout=settings.provider_timeout_seconds,
        transport=provider_transport,
    )
    try:
        await broker.connect()
        repository = WorkerRepository(engine)
        traces = BackgroundTraces(redis, settings.trace_ttl_seconds)
        notifier = Notifier(redis)
        yield Worker(
            settings=settings,
            jobs=JobWorker(
                broker,
                Handlers(repository, ProviderClient(http)),
                repository,
                traces,
                notifier,
                name=settings.name,
                prefetch=settings.prefetch,
            ),
            events=OrderEventHandlers(engine, notifier),
            traces=traces,
        )
    finally:
        await broker.close()
        await http.aclose()
        await redis.aclose()
        await engine.dispose()


async def _serve(settings: WorkerSettings) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        # Not available on Windows event loops; there Ctrl+C cancels the run instead.
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(signum, stop.set)
    async with open_worker(settings) as worker:
        await worker.run(stop, grace_seconds=settings.shutdown_grace_seconds)


def run() -> None:
    settings = WorkerSettings()  # values come from the environment
    configure_logging(SERVICE_NAME, settings.log_level)
    asyncio.run(_serve(settings))
