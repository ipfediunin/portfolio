"""The Orders API, the Payments API (Django), an order worker and the provider stub in one
process, on the real data stores and the real broker — wired like compose, so the integration
tests see whole flows: jobs through RabbitMQ, checkout through Django and its circuit breaker.

On pytest's `pythonpath` (see pyproject.toml): test modules import it by name, which they cannot
do with conftest.py under `--import-mode=importlib`. Django must be set up first
(backend/conftest.py does it)."""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import time
from collections.abc import AsyncIterator, Callable, Iterator, Mapping, MutableMapping
from dataclasses import dataclass
from typing import Any

import httpx

from backoffice import deps
from backoffice.asgi import application as payments_app
from contracts import Trace
from hub_harness import ORIGIN, running_hub
from messaging import Broker, Topology
from order_worker.main import open_worker
from order_worker.settings import WorkerSettings
from orders_api.app import create_app
from orders_api.relay import OutboxRelay, start_producer
from orders_api.settings import Settings
from provider_stub.app import create_app as create_provider
from realtime_hub.settings import HubSettings
from telemetry.background import BackgroundTraces


async def eventually(condition: Callable[[], bool], within_s: float = 10.0) -> None:
    deadline = time.monotonic() + within_s
    while not condition():
        if time.monotonic() > deadline:
            raise TimeoutError("condition not met in time")
        await asyncio.sleep(0.05)


async def purge(broker: Broker) -> None:
    """Empties the test queues: leftovers of an earlier run must not reach this one."""
    channel = await broker.connection.channel()
    try:
        topology = broker.topology
        for job_queue in topology.queues:
            names = [job_queue.name, job_queue.dead_letters]
            names += [job_queue.retry_queue(delay) for delay in topology.retry.delays_ms]
            for name in names:
                await (await channel.get_queue(name)).purge()
    finally:
        await channel.close()


async def payments_asgi(
    scope: MutableMapping[str, Any],
    receive: Callable[[], Any],
    send: Callable[[MutableMapping[str, Any]], Any],
) -> None:
    """Django's ASGI handler with the signature httpx's transport expects."""

    async def forward(message: Mapping[str, Any]) -> None:
        await send(dict(message))

    await payments_app(dict(scope), receive, forward)


def provider_double() -> httpx.MockTransport:
    """The provider stub's checkout behaviour for Django's (synchronous) client: a request marked
    `X-Fault-Provider-Down` gets no answer in time, any other gets the payment methods."""

    def answer(request: httpx.Request) -> httpx.Response:
        if request.url.path != "/v1/payment-methods":
            return httpx.Response(404)
        if request.headers.get("x-fault-provider-down") == "true":
            raise httpx.ReadTimeout("the provider is not answering", request=request)
        return httpx.Response(200, json={"payment_methods": ["card", "sbp"]})

    return httpx.MockTransport(answer)


@contextlib.contextmanager
def payments_provider(transport: httpx.BaseTransport) -> Iterator[None]:
    """Points the Payments API's provider client at `transport` for the duration."""
    from django.conf import settings  # noqa: PLC0415 — Django is set up by the caller

    previous = settings.PROVIDER_TRANSPORT
    settings.PROVIDER_TRANSPORT = transport
    deps.reset()
    try:
        yield
    finally:
        settings.PROVIDER_TRANSPORT = previous
        deps.reset()


@dataclass(frozen=True)
class Stack:
    client: httpx.AsyncClient
    broker: Broker
    # The Payments API directly, as the edge proxy routes /webhooks/ to it.
    payments: httpx.AsyncClient
    # The realtime hub's base URL, as the edge proxy routes /ws to it (full stack only).
    hub: str | None = None

    async def sandbox(self) -> dict[str, str]:
        """Authorization headers of a new sandbox."""
        headers, _ = await self.sandbox_with_secret()
        return headers

    async def sandbox_with_secret(self) -> tuple[dict[str, str], str]:
        """Authorization headers of a new sandbox and the secret that signs its webhooks."""
        response = await self.client.post("/api/sandbox")
        assert response.status_code == 201
        created = response.json()
        return {"Authorization": f"Bearer {created['token']}"}, created["webhook_secret"]

    def route(self, path: str) -> httpx.AsyncClient:
        """The client the edge proxy would send `path` to."""
        return self.payments if path.startswith("/webhooks/") else self.client

    async def finished_trace(self, trace_id: str, within_s: float = 20.0) -> Trace:
        """Polls the trace until the workers marked its background part done."""
        deadline = time.monotonic() + within_s
        while True:
            response = await self.client.get(f"/api/traces/{trace_id}")
            assert response.status_code == 200
            trace = Trace.model_validate(response.json())
            if trace.background is None or trace.background.state == "done":
                return trace
            if time.monotonic() > deadline:
                raise TimeoutError(f"the background of {trace_id} is still pending")
            await asyncio.sleep(0.2)


@contextlib.asynccontextmanager
async def api_only(settings: Settings, topology: Topology | None = None) -> AsyncIterator[Stack]:
    """The API with the Payments API behind it, but no worker: jobs stay on the queue."""
    app = create_app(settings, topology, payments_transport=httpx.ASGITransport(app=payments_asgi))
    with payments_provider(provider_double()):
        async with app.router.lifespan_context(app):
            broker: Broker = app.state.services.broker
            transport = httpx.ASGITransport(app=app)
            async with (
                httpx.AsyncClient(transport=transport, base_url="http://api.test") as client,
                httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=payments_asgi),
                    base_url="http://payments.test",
                ) as payments,
            ):
                yield Stack(client=client, broker=broker, payments=payments)


@contextlib.asynccontextmanager
async def full_stack(
    settings: Settings, amqp_url: str, *, with_relay: bool = False
) -> AsyncIterator[Stack]:
    """The API, the Payments API, a worker (jobs and the event consumer groups), the realtime hub
    and the provider stub; with `with_relay`, also the outbox relay (it needs Kafka)."""
    hub_settings = HubSettings.model_validate(
        {"redis_url": settings.redis_url, "allowed_origins": [ORIGIN], "name": "test-hub"}
    )
    async with api_only(settings) as api, running_hub(hub_settings) as hub:
        stack = dataclasses.replace(api, hub=hub)
        await eventually(lambda: stack.broker.ready)
        await purge(stack.broker)
        worker_settings = WorkerSettings.model_validate(
            {
                "amqp_url": amqp_url,
                "database_url": settings.database_url,
                "redis_url": settings.redis_url,
                "provider_url": "http://provider.test",
                "queue_prefix": settings.queue_prefix,
                "kafka_bootstrap": settings.kafka_bootstrap,
                "name": "test-worker",
            }
        )
        provider = httpx.ASGITransport(app=create_provider())
        async with open_worker(worker_settings, provider_transport=provider) as worker:
            stop = asyncio.Event()
            running = [asyncio.create_task(worker.run(stop, grace_seconds=2.0))]
            if with_relay:
                running.append(asyncio.create_task(_relay(settings, worker.traces, stop)))
            try:
                yield stack
            finally:
                stop.set()
                await asyncio.gather(*running)


async def _relay(settings: Settings, traces: BackgroundTraces, stop: asyncio.Event) -> None:
    """The outbox relay, as its container runs it, on the test database."""
    from sqlalchemy.ext.asyncio import create_async_engine  # noqa: PLC0415

    engine = create_async_engine(str(settings.database_url), pool_size=2, max_overflow=0)
    producer = await start_producer(settings)
    try:
        await OutboxRelay(engine, producer, traces).run(stop, poll_seconds=0.1)
    finally:
        await producer.stop()
        await engine.dispose()
