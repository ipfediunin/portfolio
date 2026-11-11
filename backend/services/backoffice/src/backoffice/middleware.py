"""CORS for the public webhook endpoint, and tracing.

Tracing follows the Orders API's rules (telemetry): every SQL statement the ORM runs becomes a
`db` span with its real text (Django's `execute_wrapper`). Two cases:

- Called by a traced service (it sends `X-Trace-Started-At`): the spans are placed on that
  request's clock and appended to its trace (`trace:{id}:remote`), so the Orders API's trace shows
  the Payments API's work in place.
- Called from outside (a webhook): this service starts the trace, stores it like the Orders API
  does, and answers with `X-Trace-Id` and `Server-Timing`.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse
from redis.exceptions import RedisError

from backoffice import deps
from contracts import (
    MAX_SPANS,
    TRACE_STARTED_AT_HEADER,
    HttpMethod,
    remote_spans_key,
    trace_key,
)
from telemetry import RequestRecorder, SpanRecorder, current_trace, server_timing, span
from telemetry.tracing import trace_id_from

logger = logging.getLogger(__name__)

SERVICE_NAME = "payments-api"
TRACED_PREFIXES = ("/webhooks/", "/internal/")
TRACED_METHODS: dict[str, HttpMethod] = {"GET": "GET", "POST": "POST"}
WEBHOOK_PREFIX = "/webhooks/"


def _sql_span(
    execute: Callable[..., Any], sql: str, params: Any, many: bool, context: dict[str, Any]
) -> Any:
    with span("db", sql):
        return execute(sql, params, many, context)


def _started_at(request: HttpRequest) -> float | None:
    value = request.headers.get(TRACE_STARTED_AT_HEADER, "")
    try:
        started = float(value)
    except ValueError:
        return None
    # A sane epoch, not too far from now: a forged value must not shift the spans far away.
    return started if abs(time.time() - started) < 60 else None  # noqa: PLR2004


class TraceMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        method = TRACED_METHODS.get(request.method or "")
        if method is None or not request.path.startswith(TRACED_PREFIXES):
            return self.get_response(request)
        trace_id = trace_id_from(request.headers.get("traceparent"))
        started_at = _started_at(request)
        recorder: SpanRecorder = (
            SpanRecorder(trace_id, SERVICE_NAME, origin_ms=(time.time() - started_at) * 1000)
            if started_at is not None
            else RequestRecorder(trace_id, SERVICE_NAME, method, request.path[:200])
        )
        token = current_trace.set(recorder)
        try:
            with connection.execute_wrapper(_sql_span):
                response = self.get_response(request)
        finally:
            current_trace.reset(token)

        if isinstance(recorder, RequestRecorder):
            trace = recorder.finish(response.status_code)
            self._store(trace_key(trace_id), [trace.model_dump_json()], replace=True)
            response["X-Trace-Id"] = trace_id
            response["Server-Timing"] = server_timing(trace)
            response["Timing-Allow-Origin"] = "*"
        else:
            spans = [item.model_dump_json() for item in recorder.drain()]
            self._store(remote_spans_key(trace_id), spans)
        return response

    @staticmethod
    def _store(key: str, values: list[str], *, replace: bool = False) -> None:
        if not values:
            return
        ttl = settings.TRACE_TTL_SECONDS
        try:
            if replace:
                deps.redis().set(key, values[0], ex=ttl)
                return
            pipe = deps.redis().pipeline()
            pipe.rpush(key, *values)
            pipe.ltrim(key, 0, MAX_SPANS - 1)
            pipe.expire(key, ttl)
            pipe.execute()
        except (RedisError, OSError):
            # Tracing never decides the answer: the request went through, its spans are lost.
            logger.warning("Could not store the trace", exc_info=True)


class CorsMiddleware:
    """The playground sends webhooks from the browser: preflight and CORS headers for the
    webhook endpoint, for the website's origins only."""

    ALLOW_HEADERS = "authorization, content-type, traceparent, webhook-signature"
    EXPOSE_HEADERS = "x-trace-id, server-timing, x-idempotent-replay, retry-after"

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if not request.path.startswith(WEBHOOK_PREFIX):
            return self.get_response(request)
        preflight = request.method == "OPTIONS"
        response = HttpResponse(status=204) if preflight else self.get_response(request)
        origin = request.headers.get("Origin")
        response["Vary"] = "Origin"
        if origin and origin in settings.CORS_ORIGINS:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Expose-Headers"] = self.EXPOSE_HEADERS
            if preflight:
                response["Access-Control-Allow-Methods"] = "POST"
                response["Access-Control-Allow-Headers"] = self.ALLOW_HEADERS
                response["Access-Control-Max-Age"] = "600"
        return response
