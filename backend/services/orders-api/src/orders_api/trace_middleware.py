"""Pure ASGI middleware that traces the demo routes.

It starts a recorder before the app runs and, when the response starts, finishes the trace,
stores it and adds `X-Trace-Id` and `Server-Timing` to the response. Storing happens before the
response leaves, so the website can fetch the trace right after it gets the answer. Work the
request queued is traced by the workers into the same trace id (see `TraceStore.load`)."""

from __future__ import annotations

import logging

from redis.exceptions import RedisError
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from contracts import HttpMethod, Trace
from orders_api.redis_stores import TraceStore
from telemetry import RequestRecorder, current_trace, server_timing, trace_id_from

logger = logging.getLogger(__name__)

SERVICE_NAME = "orders-api"
TRACED_PREFIXES = ("/api/orders", "/api/products", "/api/reports")
TRACED_METHODS: dict[str, HttpMethod] = {"GET": "GET", "POST": "POST"}


async def _store(store: TraceStore, trace: Trace) -> None:
    """Tracing never decides a request's fate: without Redis the answer goes out untraced."""
    try:
        await store.save(trace)
    except (RedisError, OSError):
        logger.warning("Could not store trace %s", trace.trace_id)


class TraceMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        method = TRACED_METHODS.get(scope.get("method", "")) if scope["type"] == "http" else None
        if method is None or not str(scope["path"]).startswith(TRACED_PREFIXES):
            await self.app(scope, receive, send)
            return

        store: TraceStore = scope["app"].state.services.traces
        recorder = RequestRecorder(
            trace_id_from(Headers(scope=scope).get("traceparent")),
            SERVICE_NAME,
            method,
            str(scope["path"])[:200],
        )
        started = False

        async def send_with_trace(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                trace = recorder.finish(int(message["status"]))
                if not scope.get("state", {}).get("redis_down"):
                    await _store(store, trace)
                headers = MutableHeaders(scope=message)
                headers["X-Trace-Id"] = trace.trace_id
                headers["Server-Timing"] = server_timing(trace)
                headers["Timing-Allow-Origin"] = "*"
            await send(message)

        token = current_trace.set(recorder)
        try:
            await self.app(scope, receive, send_with_trace)
        except Exception:
            # The 500 itself is sent by Starlette's outer error middleware; keep its trace anyway.
            if not started:
                await _store(store, recorder.finish(500))
            logger.exception("Unhandled error", extra={"trace_id": recorder.trace_id})
            raise
        finally:
            current_trace.reset(token)
