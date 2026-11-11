"""Span recording shared by the services.

Every unit of work — a request in the API, one attempt of a job in a worker — gets a recorder in a
context variable, and the code wraps its steps in `span(...)`. All recorders of a trace share one
clock: offsets in milliseconds from the moment the request started, so the website can lay the
API's spans and the workers' spans on one timeline."""

from __future__ import annotations

import re
import secrets
import time
from contextvars import ContextVar
from types import TracebackType
from typing import Self

from contracts import MAX_SPANS, Background, HttpMethod, SpanKind, Trace, TraceSpan

_TRACEPARENT = re.compile(r"^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$")
_MAX_NAME = 200


def trace_id_from(traceparent: str | None) -> str:
    """Continues the caller's W3C trace (`traceparent` header) or starts a new one."""
    if traceparent:
        match = _TRACEPARENT.match(traceparent.strip().lower())
        if match and match.group(1) != "0" * 32 and match.group(2) != "0" * 16:
            return match.group(1)
    return secrets.token_hex(16)


class SpanRecorder:
    """Collects the spans of one unit of work. Not thread-safe: one recorder per task.

    `origin_ms` places the recorder on the trace's clock: 0 for the request itself, the time
    elapsed since the request started for a worker that picks the job up later.
    """

    def __init__(self, trace_id: str, service: str, *, origin_ms: float = 0.0) -> None:
        self.trace_id = trace_id
        self.service = service
        self.started_ns = time.perf_counter_ns()
        # Wall clock of the start: other processes place their spans relative to it.
        self.started_at = time.time()
        self._origin_ms = max(0.0, origin_ms)
        self.spans: list[TraceSpan] = []
        self._drained = 0

    def add(self, span: TraceSpan) -> None:
        if len(self.spans) < MAX_SPANS:
            self.spans.append(span)

    def offset_ms(self, at_ns: int) -> float:
        return round(self._origin_ms + (at_ns - self.started_ns) / 1_000_000, 3)

    def drain(self) -> list[TraceSpan]:
        """Spans recorded since the previous call (a worker stores them step by step)."""
        fresh = self.spans[self._drained :]
        self._drained = len(self.spans)
        return fresh


class RequestRecorder(SpanRecorder):
    """The recorder of one HTTP request; finishes into the stored `Trace`."""

    def __init__(self, trace_id: str, service: str, method: HttpMethod, path: str) -> None:
        super().__init__(trace_id, service)
        self.method: HttpMethod = method
        self.path = path
        # Set when the request queued a job: the trace then waits for the workers' spans.
        self.queued_background = False

    def finish(self, status: int) -> Trace:
        return Trace(
            trace_id=self.trace_id,
            method=self.method,
            path=self.path,
            status=status,
            duration_ms=self.offset_ms(time.perf_counter_ns()),
            spans=list(self.spans),
            background=Background(state="pending") if self.queued_background else None,
        )


current_trace: ContextVar[SpanRecorder | None] = ContextVar("current_trace", default=None)


class span:  # noqa: N801 — reads as a keyword: `with span("db", sql):`
    """Times one step of the current unit of work; a no-op outside one.

    Works with `with` and `async with`. An exception inside marks the span as failed and is
    re-raised; set `ok = False` explicitly for handled failures (a cache miss is not a failure).
    """

    def __init__(self, kind: SpanKind, name: str) -> None:
        self.kind: SpanKind = kind
        self.name = " ".join(name.split())[:_MAX_NAME]
        self.ok = True
        self.attributes: dict[str, str | int | float | bool] = {}
        self._start_ns = 0

    def __enter__(self) -> Self:
        self._start_ns = time.perf_counter_ns()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        end_ns = time.perf_counter_ns()
        recorder = current_trace.get()
        if recorder is None:
            return
        recorder.add(
            TraceSpan(
                kind=self.kind,
                name=self.name,
                service=recorder.service,
                start_ms=recorder.offset_ms(self._start_ns),
                duration_ms=round((end_ns - self._start_ns) / 1_000_000, 3),
                ok=self.ok and exc_type is None,
                attributes=self.attributes,
            )
        )

    async def __aenter__(self) -> Self:
        return self.__enter__()

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.__exit__(exc_type, exc, traceback)


def _quoted(value: str) -> str:
    """An HTTP quoted-string: printable ASCII only (headers are not UTF-8), quotes escaped."""
    printable = "".join(char for char in value if char.isascii() and char.isprintable())
    return '"' + printable.replace("\\", "\\\\").replace('"', '\\"') + '"'


def server_timing(trace: Trace) -> str:
    """`Server-Timing` header value: one metric per span, plus the total."""
    metrics = [
        f"{item.kind};dur={item.duration_ms:.3f};desc={_quoted(item.name[:80])}"
        for item in trace.spans
    ]
    metrics.append(f"total;dur={trace.duration_ms:.3f}")
    return ", ".join(metrics)
