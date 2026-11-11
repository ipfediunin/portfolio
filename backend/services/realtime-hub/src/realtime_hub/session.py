"""One page's socket, from the handshake to the close.

1. The upgrade must come from an allowed origin (checked before the socket is accepted).
2. The first message is `auth` with the sandbox token, within `auth_timeout_seconds`. The token is
   looked up by its SHA-256, as the Orders API does; the socket belongs to the sandbox's owner key.
   Nothing about the token is kept after that.
3. The page may then send `watch` messages; the hub sends `notification` and `trace.done`.
4. The socket closes when the sandbox expires or is deleted, and when the page floods the hub or
   reads too slowly. The close code tells the page whether to reconnect.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from contracts import (
    CLIENT_MESSAGE,
    AuthMessage,
    CloseCode,
    ReadyMessage,
    WatchMessage,
    background_done_key,
    client_key,
    sandbox_key,
    token_hash,
)
from realtime_hub.hub import Connection, Hub
from realtime_hub.settings import HubSettings

logger = logging.getLogger(__name__)

# The page's message budget is counted over this window.
_FLOOD_WINDOW_S = 10.0


@dataclass(frozen=True)
class SessionContext:
    hub: Hub
    redis: Redis
    settings: HubSettings


@dataclass(frozen=True)
class _Sandbox:
    token_hash: str
    owner: str
    seconds_left: int


async def serve(websocket: WebSocket, ctx: SessionContext) -> None:
    if websocket.headers.get("origin") not in ctx.settings.allowed_origins:
        # Before accepting: the client gets an HTTP 403 instead of a socket.
        await websocket.close(code=CloseCode.POLICY)
        return
    await websocket.accept()
    try:
        sandbox = await _authenticate(websocket, ctx)
        if sandbox is None:
            return
        if not await _take_slot(ctx, sandbox):
            await _close(websocket, CloseCode.TOO_MANY)
            return
        try:
            code = await _session(websocket, ctx, sandbox)
        finally:
            await _release_slot(ctx, sandbox)
    except RedisError:
        logger.warning("Redis failed under a socket; closing it", exc_info=True)
        code = CloseCode.TRY_LATER
    if code is not None:
        await _close(websocket, code)


async def _authenticate(websocket: WebSocket, ctx: SessionContext) -> _Sandbox | None:
    try:
        text = await asyncio.wait_for(_receive(websocket), ctx.settings.auth_timeout_seconds)
    except TimeoutError:
        await _close(websocket, CloseCode.AUTH_TIMEOUT)
        return None
    except WebSocketDisconnect:
        return None
    message = _parse(text)
    if not isinstance(message, AuthMessage):
        await _close(websocket, CloseCode.POLICY)
        return None
    hashed = token_hash(message.token)
    seconds_left = await ctx.redis.ttl(sandbox_key(hashed))
    if seconds_left <= 0:
        await _close(websocket, CloseCode.UNAUTHORIZED)
        return None
    return _Sandbox(token_hash=hashed, owner=client_key(hashed), seconds_left=seconds_left)


async def _session(websocket: WebSocket, ctx: SessionContext, sandbox: _Sandbox) -> int | None:
    """Runs the socket until something ends it; returns the close code (None: the page left)."""
    connection = Connection(owner=sandbox.owner, outbox=asyncio.Queue(ctx.settings.outbox_size))
    ctx.hub.add(connection)
    try:
        await websocket.send_text(ReadyMessage(expires_in=sandbox.seconds_left).model_dump_json())
        tasks = [
            asyncio.create_task(_read(websocket, connection, ctx)),
            asyncio.create_task(_write(websocket, connection)),
            asyncio.create_task(_keep(connection, ctx, sandbox)),
        ]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        return next(iter(done)).result()
    except WebSocketDisconnect:
        return None
    finally:
        ctx.hub.remove(connection)


async def _read(websocket: WebSocket, connection: Connection, ctx: SessionContext) -> int | None:
    loop = asyncio.get_running_loop()
    window_started, received = loop.time(), 0
    while True:
        try:
            text = await _receive(websocket)
        except WebSocketDisconnect:
            return None
        now = loop.time()
        if now - window_started >= _FLOOD_WINDOW_S:
            window_started, received = now, 0
        received += 1
        message = _parse(text)
        if received > ctx.settings.max_client_messages or not isinstance(message, WatchMessage):
            return CloseCode.POLICY
        if not ctx.hub.watch(connection, message.trace_id):
            return CloseCode.POLICY
        # Done before the page asked: no announcement will come, answer right away.
        if await ctx.redis.exists(background_done_key(message.trace_id)):
            ctx.hub.trace_done(connection, message.trace_id)


async def _write(websocket: WebSocket, connection: Connection) -> int | None:
    while True:
        message = await connection.outbox.get()
        try:
            await websocket.send_text(message)
        except (WebSocketDisconnect, OSError):
            return None


async def _keep(connection: Connection, ctx: SessionContext, sandbox: _Sandbox) -> int:
    """Closes the socket when its sandbox is gone, or when the page reads too slowly."""
    loop = asyncio.get_running_loop()
    expires_at = loop.time() + sandbox.seconds_left
    while True:
        remaining = expires_at - loop.time()
        if remaining <= 0:
            return CloseCode.SANDBOX_GONE
        if await _happens(
            connection.overflowed, min(ctx.settings.sandbox_check_seconds, remaining)
        ):
            return CloseCode.TRY_LATER
        if not await ctx.redis.exists(sandbox_key(sandbox.token_hash)):
            return CloseCode.SANDBOX_GONE


async def _take_slot(ctx: SessionContext, sandbox: _Sandbox) -> bool:
    """Counts the sandbox's sockets across replicas; the count expires with the sandbox."""
    key = _slots_key(sandbox.owner)
    async with ctx.redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, sandbox.seconds_left)
        taken, _ = await pipe.execute()
    if int(taken) <= ctx.settings.max_connections_per_sandbox:
        return True
    await ctx.redis.decr(key)
    return False


async def _release_slot(ctx: SessionContext, sandbox: _Sandbox) -> None:
    try:
        await ctx.redis.decr(_slots_key(sandbox.owner))
    except RedisError:
        # The count expires with the sandbox; until then it is one too high.
        logger.warning("Could not release a socket slot", exc_info=True)


def _slots_key(owner: str) -> str:
    return f"ws:sockets:{owner}"


async def _receive(websocket: WebSocket) -> str | None:
    """The next text message; None for a binary one. Raises when the page disconnects."""
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(code=int(message.get("code", 1000)))
    text = message.get("text")
    return text if isinstance(text, str) else None


def _parse(text: str | None) -> AuthMessage | WatchMessage | None:
    if text is None:
        return None
    try:
        return CLIENT_MESSAGE.validate_json(text)
    except ValidationError:
        return None


async def _happens(event: asyncio.Event, within_s: float) -> bool:
    try:
        async with asyncio.timeout(within_s):
            await event.wait()
    except TimeoutError:
        return False
    return True


async def _close(websocket: WebSocket, code: int) -> None:
    # The page may already be gone; then there is nobody to tell.
    with contextlib.suppress(WebSocketDisconnect, RuntimeError, OSError):
        await websocket.close(code=code)
