"""The trace of one live request: what the services did, in order, and how long each step took.

A request that hands work to a queue has two parts: the synchronous spans of the API, recorded
while the visitor waits, and the background spans the workers add later (`background`). Both use
the same span format and the same clock: offsets from the moment the request started.

A trace has no personal data: span names are operation templates (`SELECT … WHERE id = :id`,
`GET cache:<namespace>:product:7`), attributes are flags and counters, never request bodies.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

SpanKind = Literal[
    "rate_limit",  # token bucket check at the edge of the service
    "auth",  # sandbox token verification
    "validate",  # request body validation
    "handle",  # the handler's own work between I/O calls
    "cache_get",  # cache read (attribute `hit`)
    "cache_set",  # cache write after a miss
    "db",  # one SQL statement
    "publish",  # a job handed to the broker, confirmed by it (attribute `queue`)
    "consume",  # a worker took a job from the queue (attributes `attempt`, `queued_ms`, `worker`)
    "external",  # a call to an external HTTP API (attribute `status`)
    "retry",  # a failed attempt scheduled for redelivery (attribute `delay_ms`)
    "dead_letter",  # the last attempt failed: the job moved to the dead-letter queue
    "breaker",  # a circuit breaker decision (attributes `state`, `failures`)
    "notify",  # a notification filed for the sandbox and published to the hub (attribute `event`)
    "push",  # the hub sent a notification over WebSocket (attributes `event`, `connections`)
]

AttributeValue = str | int | float | bool
HttpMethod = Literal["GET", "POST", "DELETE"]
TraceId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]

MAX_SPANS = 64


class TraceSpan(BaseModel):
    """One operation. Spans are flat and ordered by start time."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: SpanKind
    name: str = Field(min_length=1, max_length=200)
    service: str = Field(min_length=1, max_length=40)
    start_ms: float = Field(ge=0, description="Offset from the start of the request")
    duration_ms: float = Field(ge=0)
    ok: bool
    attributes: dict[str, AttributeValue] = Field(default_factory=dict)


class Background(BaseModel):
    """Work the request queued: `pending` while workers are on it, `done` once the job finished
    (succeeded or dead-lettered). Spans arrive as the workers record them."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    state: Literal["pending", "done"]
    spans: list[TraceSpan] = Field(default_factory=list, max_length=MAX_SPANS)


class Trace(BaseModel):
    """A request with its spans; stored for a few minutes so the website can replay it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    trace_id: TraceId
    method: HttpMethod
    path: str = Field(min_length=1, max_length=200)
    status: int = Field(ge=100, le=599)
    duration_ms: float = Field(ge=0)
    spans: list[TraceSpan] = Field(max_length=MAX_SPANS)
    # Set when the request queued background work.
    background: Background | None = None


def trace_key(trace_id: str) -> str:
    """Redis key of a request's synchronous trace (written by the API)."""
    return f"trace:{trace_id}"


def background_spans_key(trace_id: str) -> str:
    """Redis list of the background spans, appended by the workers as they go."""
    return f"trace:{trace_id}:background"


def background_done_key(trace_id: str) -> str:
    """Set by the worker that finished the job: the background part is complete."""
    return f"trace:{trace_id}:background:done"


def remote_spans_key(trace_id: str) -> str:
    """Redis list of spans recorded by services the request called synchronously (the Payments
    API behind the Orders API). They belong to the request's own part of the trace."""
    return f"trace:{trace_id}:remote"


# Headers a traced service passes to the services it calls, so their spans join its trace.
TRACE_STARTED_AT_HEADER = "X-Trace-Started-At"  # epoch seconds when the request started
