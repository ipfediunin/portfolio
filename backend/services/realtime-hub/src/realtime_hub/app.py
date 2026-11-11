"""The hub's ASGI app: `/ws` for the pages (routed by the edge proxy), `/healthz` for compose."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError

from contracts import EVENTS_CHANNEL_PATTERN, TRACES_DONE_CHANNEL
from realtime_hub.hub import Hub
from realtime_hub.session import SessionContext, serve
from realtime_hub.settings import HubSettings
from telemetry.background import BackgroundTraces
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

# Before the listener subscribes again after losing Redis.
RESUBSCRIBE_SECONDS = 1.0


class Listener:
    """Keeps the replica subscribed to every sandbox channel and to finished traces. Pub/sub does
    not queue: while Redis is away, pages miss pushes and fall back to fetching the trace."""

    def __init__(self, redis: Redis, hub: Hub) -> None:
        self._redis = redis
        self._hub = hub
        self.subscribed = False

    async def run(self) -> None:
        while True:
            try:
                await self._listen()
            except (RedisError, OSError):
                logger.warning(
                    "Lost the Redis subscription; again in %.0f s",
                    RESUBSCRIBE_SECONDS,
                    exc_info=True,
                )
            finally:
                self.subscribed = False
            await asyncio.sleep(RESUBSCRIBE_SECONDS)

    async def _listen(self) -> None:
        async with self._redis.pubsub(ignore_subscribe_messages=True) as pubsub:
            await pubsub.psubscribe(EVENTS_CHANNEL_PATTERN)
            await pubsub.subscribe(TRACES_DONE_CHANNEL)
            self.subscribed = True
            logger.info("Listening for notifications and finished traces")
            async for message in pubsub.listen():
                if message["type"] in ("message", "pmessage"):
                    # One at a time, in Redis's order (see realtime_hub.hub).
                    await self._hub.handle(str(message["channel"]), str(message["data"]))


def create_app(settings: HubSettings | None = None) -> FastAPI:
    settings = settings or HubSettings()  # values come from the environment

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        redis = connect_redis(str(settings.redis_url))
        hub = Hub(
            BackgroundTraces(redis, settings.trace_ttl_seconds),
            replica=settings.name,
            max_watches=settings.max_watches,
        )
        listener = Listener(redis, hub)
        listening = asyncio.create_task(listener.run())
        app.state.listener = listener
        app.state.context = SessionContext(hub=hub, redis=redis, settings=settings)
        try:
            yield
        finally:
            listening.cancel()
            await asyncio.gather(listening, return_exceptions=True)
            await redis.aclose()

    app = FastAPI(
        title="Runtime City · realtime hub",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.get("/healthz")
    async def healthz() -> JSONResponse:
        listener: Listener = app.state.listener
        context: SessionContext = app.state.context
        ready = listener.subscribed
        return JSONResponse(
            {"status": "ok" if ready else "unsubscribed", "sockets": context.hub.open_sockets},
            status_code=200 if ready else 503,
        )

    @app.websocket("/ws")
    async def socket(websocket: WebSocket) -> None:
        await serve(websocket, app.state.context)

    return app
