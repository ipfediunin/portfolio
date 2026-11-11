"""The Orders API application: resources are opened in the lifespan and shared through
`app.state.services`; expired sandbox orders and tasks are swept by a background task. RabbitMQ is
connected in the background: the API serves everything else while the broker is unreachable."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from messaging import Broker, Topology
from orders_api.dependencies import Services
from orders_api.rate_limit import TokenBuckets
from orders_api.redis_stores import ProductCache, SandboxStore, TraceStore
from orders_api.repository import Repository
from orders_api.routes import checkout, demo, jobs, sandbox, system
from orders_api.settings import Settings, get_settings
from orders_api.trace_middleware import TraceMiddleware
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

# A Redis call that takes longer than this counts as Redis being down.
REDIS_TIMEOUT_S = 0.5
# Retry-After when a dependency (Redis) is down.
DEPENDENCY_RETRY_AFTER_S = 5

EXPOSED_HEADERS = [
    "X-Trace-Id",
    "Server-Timing",
    "X-Cache",
    "Retry-After",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "Location",
]


class NoStoreMiddleware:
    """Marks every API answer `Cache-Control: no-store`: responses are per client and per moment,
    and a browser cache must never answer for the service."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_no_store(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_no_store)


async def _sweep_expired_orders(repository: Repository, interval_seconds: int) -> None:
    """Deletes sandbox orders past their expiry. Idempotent, so every replica may run it."""
    while True:
        try:
            deleted = await repository.delete_expired()
            if deleted:
                logger.info("Deleted %d expired sandbox orders and tasks", deleted)
        except (SQLAlchemyError, OSError):
            logger.exception("Sweeping expired orders failed; retrying on the next tick")
        await asyncio.sleep(interval_seconds)


def _services(
    settings: Settings,
    topology: Topology,
    payments_transport: httpx.AsyncBaseTransport | None,
) -> Services:
    # Redis answers in well under a millisecond: half a second without one means it is down,
    # and the request fails fast with 503 instead of hanging (chaos experiment `redis-down`).
    # One repeat: enough for a connection Redis closed, little delay when Redis is down.
    redis = connect_redis(str(settings.redis_url), timeout_s=REDIS_TIMEOUT_S, retries=1)
    engine = create_async_engine(
        str(settings.database_url), pool_size=10, max_overflow=5, pool_pre_ping=True
    )
    return Services(
        settings=settings,
        redis=redis,
        engine=engine,
        repository=Repository(engine),
        sandboxes=SandboxStore(redis, settings.sandbox_ttl_seconds),
        products=ProductCache(redis, settings.product_cache_ttl_seconds),
        traces=TraceStore(redis, settings.trace_ttl_seconds),
        buckets=TokenBuckets(redis),
        broker=Broker(str(settings.amqp_url), topology),
        payments=httpx.AsyncClient(
            base_url=str(settings.payments_url),
            timeout=settings.payments_timeout_seconds,
            transport=payments_transport,
        ),
    )


def create_app(
    settings: Settings | None = None,
    topology: Topology | None = None,
    payments_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`topology` and `payments_transport` are for tests (a tiny queue to show backpressure,
    the Payments API mounted in-process); the service derives them from the settings."""
    settings = settings or get_settings()
    queues = topology or Topology(prefix=settings.queue_prefix)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        services = _services(settings, queues, payments_transport)
        app.state.services = services
        sweeper = asyncio.create_task(
            _sweep_expired_orders(services.repository, settings.cleanup_interval_seconds)
        )
        connecting = asyncio.create_task(services.broker.connect())
        try:
            yield
        finally:
            for task in (sweeper, connecting):
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            await services.broker.close()
            await services.payments.aclose()
            try:
                await services.redis.aclose()
            except RedisError:
                logger.exception("Closing Redis failed")
            await services.engine.dispose()

    app = FastAPI(
        title="Runtime City · Orders API",
        version="1.0.0",
        summary="The live backend behind the playground on the Runtime City website.",
        lifespan=lifespan,
        redoc_url=None,
    )

    @app.exception_handler(RedisError)
    async def redis_unavailable(request: Request, error: RedisError) -> JSONResponse:
        # Sandboxes, rate limits, the cache and traces live in Redis: without it the API cannot
        # tell who is asking. An honest 503 with Retry-After, like a full queue.
        logger.warning("Redis is unavailable: %s", type(error).__name__)
        # The trace of this answer is not stored: the Redis that just failed would only fail again.
        request.state.redis_down = True
        return JSONResponse(
            {"detail": "Temporarily unavailable, try again later"},
            status_code=503,
            headers={"Retry-After": str(DEPENDENCY_RETRY_AFTER_S)},
        )

    app.include_router(demo.router)
    app.include_router(jobs.router)
    app.include_router(checkout.router)
    app.include_router(sandbox.router)
    app.include_router(system.router)
    app.add_middleware(NoStoreMiddleware)
    # Added after the tracer, CORS is the outer layer: preflight requests never reach the tracer.
    app.add_middleware(TraceMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Cache-Control",
            "traceparent",
            "X-Fault-Fail-Attempts",
            "X-Fault-Provider-Down",
        ],
        expose_headers=EXPOSED_HEADERS,
        max_age=600,
    )
    return app
