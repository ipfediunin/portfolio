"""Live notifications for the page, delivered by the realtime hub over a WebSocket.

Producers — the job worker when a task ends, the notifications consumer group when an order is
created — file a `Notification` in the sandbox's inbox (a short Redis list) and publish it on the
sandbox's Redis channel. Every hub replica listens to every sandbox channel and forwards a
notification to the sandbox's connections it holds. When a trace's background part is complete,
`BackgroundTraces.finish` announces it on `TRACES_DONE_CHANNEL`; the hub tells the connections
that watch that trace, so the page fetches the trace once instead of polling it.

The WebSocket protocol below is mirrored by Zod in `src/features/playground/live-events.ts`.
No personal data: owners are hashed sandbox keys, notifications carry ids and event names.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Final, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from contracts.trace import TraceId

NotificationEvent = Literal[
    "report.ready",
    "report.failed",
    "payment.succeeded",
    "payment.failed",
    "order.created",
]

TRACES_DONE_CHANNEL: Final = "traces:done"
# Hub replicas subscribe to every sandbox's channel with one pattern.
EVENTS_CHANNEL_PATTERN: Final = "events:t:*"


def events_channel(owner_key: str) -> str:
    """The Redis channel a sandbox's notifications are published on."""
    return f"events:{owner_key}"


def notifications_key(owner_key: str) -> str:
    """The sandbox's latest notifications (Redis list), kept as long as the sandbox."""
    return f"notifications:{owner_key}"


class Notification(BaseModel):
    """Something the page should hear about now. It carries the trace it belongs to, so the hub
    records its push into that trace."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    event: NotificationEvent
    task_id: UUID | None = None
    order_id: int | None = Field(default=None, ge=1)
    trace_id: TraceId
    # Epoch seconds when the request started: the hub places its span on the request's clock.
    trace_started_at: float = Field(gt=0)
    at: datetime


# --- WebSocket protocol: the page → the hub ---------------------------------------------------


class AuthMessage(BaseModel):
    """The first message: the sandbox token goes in the message, never in the URL."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["auth"]
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class WatchMessage(BaseModel):
    """Tell me when this trace's background part is complete."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["watch"]
    trace_id: TraceId


ClientMessage = Annotated[AuthMessage | WatchMessage, Field(discriminator="type")]
CLIENT_MESSAGE: TypeAdapter[AuthMessage | WatchMessage] = TypeAdapter(ClientMessage)


# --- WebSocket protocol: the hub → the page ---------------------------------------------------


class ReadyMessage(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["ready"] = "ready"
    # Seconds until the sandbox expires; the hub closes the connection then.
    expires_in: int = Field(ge=0)


class NotificationMessage(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["notification"] = "notification"
    event: NotificationEvent
    task_id: UUID | None = None
    order_id: int | None = None
    trace_id: TraceId
    at: datetime


class TraceDoneMessage(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["trace.done"] = "trace.done"
    trace_id: TraceId


class CloseCode:
    """Application close codes (4000 to 4999, plus two standard ones) the page acts on."""

    UNAUTHORIZED: Final = 4401  # no such sandbox: get a new one before reconnecting
    AUTH_TIMEOUT: Final = 4408  # no auth message in time
    SANDBOX_GONE: Final = 4410  # the sandbox expired or was deleted
    TOO_MANY: Final = 4429  # the sandbox has its maximum of open connections
    POLICY: Final = 1008  # malformed message, flooding, a second auth
    TRY_LATER: Final = 1013  # the page reads too slowly, or the hub lost Redis: reconnect later
