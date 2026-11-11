"""The hub's registry of open sockets, and what it does with each message from Redis.

One Redis connection per replica listens to every sandbox's channel and to `traces:done`, and the
messages are handled one at a time, in the order Redis delivered them. That order keeps the page's
view consistent: a producer publishes a notification before it marks the trace done, so the hub
has stored its push span in the trace before it tells the page that the trace is complete.

Each socket has a bounded outbox drained by its own writer: a slow page does not hold up the
others, and one that falls too far behind is closed (it reconnects and fetches what it missed).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from pydantic import ValidationError

from contracts import (
    TRACES_DONE_CHANNEL,
    Notification,
    NotificationMessage,
    TraceDoneMessage,
)
from telemetry import SpanRecorder, current_trace, span
from telemetry.background import BackgroundTraces

logger = logging.getLogger(__name__)

SERVICE_NAME = "realtime-hub"
_EVENTS_PREFIX = "events:"


@dataclass(eq=False)
class Connection:
    """One open socket of one sandbox."""

    owner: str
    outbox: asyncio.Queue[str]
    # Traces the page waits for.
    watches: set[str] = field(default_factory=set)
    # Set when the outbox overflowed: the socket is closed as a slow consumer.
    overflowed: asyncio.Event = field(default_factory=asyncio.Event)


class Hub:
    def __init__(self, traces: BackgroundTraces, *, replica: str, max_watches: int) -> None:
        self._traces = traces
        self._replica = replica
        self._max_watches = max_watches
        self._by_owner: dict[str, set[Connection]] = {}
        self._by_trace: dict[str, set[Connection]] = {}

    @property
    def open_sockets(self) -> int:
        return sum(len(group) for group in self._by_owner.values())

    def add(self, connection: Connection) -> None:
        self._by_owner.setdefault(connection.owner, set()).add(connection)

    def remove(self, connection: Connection) -> None:
        owned = self._by_owner.get(connection.owner)
        if owned is not None:
            owned.discard(connection)
            if not owned:
                del self._by_owner[connection.owner]
        for trace_id in connection.watches:
            self._unwatch(connection, trace_id)
        connection.watches.clear()

    def watch(self, connection: Connection, trace_id: str) -> bool:
        """Registers interest in a trace; False when the socket already waits for too many."""
        if trace_id in connection.watches:
            return True
        if len(connection.watches) >= self._max_watches:
            return False
        connection.watches.add(trace_id)
        self._by_trace.setdefault(trace_id, set()).add(connection)
        return True

    def trace_done(self, connection: Connection, trace_id: str) -> None:
        """Tells one socket that a trace it watches is complete (it was done before the watch)."""
        if trace_id in connection.watches:
            connection.watches.discard(trace_id)
            self._unwatch(connection, trace_id)
            self._enqueue(connection, TraceDoneMessage(trace_id=trace_id).model_dump_json())

    async def handle(self, channel: str, data: str) -> None:
        """One message from Redis: a finished trace, or a notification for a sandbox."""
        if channel == TRACES_DONE_CHANNEL:
            self._announce_done(data)
        elif channel.startswith(_EVENTS_PREFIX):
            await self._push(channel.removeprefix(_EVENTS_PREFIX), data)

    def _announce_done(self, trace_id: str) -> None:
        watchers = self._by_trace.pop(trace_id, set())
        if not watchers:
            return
        message = TraceDoneMessage(trace_id=trace_id).model_dump_json()
        for connection in watchers:
            connection.watches.discard(trace_id)
            self._enqueue(connection, message)

    async def _push(self, owner: str, data: str) -> None:
        targets = self._by_owner.get(owner)
        if not targets:
            return  # the sandbox has no socket on this replica
        try:
            notification = Notification.model_validate_json(data)
        except ValidationError:
            logger.exception("Dropping a malformed notification for %s", owner)
            return
        message = NotificationMessage(
            event=notification.event,
            task_id=notification.task_id,
            order_id=notification.order_id,
            trace_id=notification.trace_id,
            at=notification.at,
        ).model_dump_json()
        recorder = SpanRecorder(
            notification.trace_id,
            SERVICE_NAME,
            origin_ms=(time.time() - notification.trace_started_at) * 1000,
        )
        token = current_trace.set(recorder)
        try:
            with span("push", f"ws.send {notification.event}") as step:
                step.attributes.update(
                    {"event": notification.event, "connections": len(targets), "hub": self._replica}
                )
                for connection in list(targets):
                    self._enqueue(connection, message)
        finally:
            current_trace.reset(token)
        # Stored before the next Redis message is handled (see the module docstring).
        await self._traces.append(notification.trace_id, recorder.drain())

    def _unwatch(self, connection: Connection, trace_id: str) -> None:
        watchers = self._by_trace.get(trace_id)
        if watchers is not None:
            watchers.discard(connection)
            if not watchers:
                del self._by_trace[trace_id]

    @staticmethod
    def _enqueue(connection: Connection, message: str) -> None:
        try:
            connection.outbox.put_nowait(message)
        except asyncio.QueueFull:
            connection.overflowed.set()
