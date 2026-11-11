"""The realtime hub for tests: a real Uvicorn server in the test's event loop, on a free port, and a
WebSocket client that talks to it like the page does."""

from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
from collections.abc import AsyncIterator
from typing import Any

import httpx
import uvicorn
from redis.asyncio import Redis
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed
from websockets.typing import Origin

from contracts import token_hash
from orders_api.redis_stores import SandboxStore
from realtime_hub.app import create_app
from realtime_hub.settings import HubSettings

ORIGIN = "http://localhost:3000"


@contextlib.asynccontextmanager
async def running_hub(settings: HubSettings) -> AsyncIterator[str]:
    """Serves the hub until the block ends; yields its base URL (http://127.0.0.1:<port>)."""
    config = uvicorn.Config(
        create_app(settings),
        host="127.0.0.1",
        port=0,
        log_config=None,
        access_log=False,
        ws_max_size=4096,
        lifespan="on",
    )
    server = uvicorn.Server(config)
    serving = asyncio.create_task(server.serve())
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if serving.done():
                    serving.result()  # raises what stopped the server
                    raise RuntimeError("The hub stopped before it started")
                await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        async with asyncio.timeout(10), httpx.AsyncClient(base_url=url) as client:
            # Ready once its Redis listener is subscribed, as compose's healthcheck sees it.
            while True:
                if (await client.get("/healthz")).status_code == 200:
                    break
                await asyncio.sleep(0.02)
        yield url
    finally:
        server.should_exit = True
        await serving


async def new_sandbox(redis: Redis, ttl_seconds: int = 1800) -> str:
    """A sandbox as the Orders API creates it; returns its token."""
    token = secrets.token_urlsafe(32)
    await SandboxStore(redis, ttl_seconds).create(token_hash(token))
    return token


def socket_url(hub_url: str) -> str:
    return hub_url.replace("http://", "ws://", 1) + "/ws"


@contextlib.asynccontextmanager
async def page_socket(
    hub_url: str, token: str | None, *, origin: str = ORIGIN
) -> AsyncIterator[ClientConnection]:
    """A socket as the page opens it: authenticated with `token` (None: no auth message)."""
    async with connect(socket_url(hub_url), origin=Origin(origin), open_timeout=5) as socket:
        if token is not None:
            await socket.send(json.dumps({"type": "auth", "token": token}))
        yield socket


async def receive(socket: ClientConnection, within_s: float = 5.0) -> dict[str, Any]:
    async with asyncio.timeout(within_s):
        message: dict[str, Any] = json.loads(await socket.recv())
    return message


async def nothing_arrives(socket: ClientConnection, within_s: float = 0.5) -> bool:
    try:
        async with asyncio.timeout(within_s):
            await socket.recv()
    except TimeoutError:
        return True
    return False


async def close_code(socket: ClientConnection, within_s: float = 5.0) -> int | None:
    """Waits for the hub to close the socket; returns the code it sent."""
    try:
        async with asyncio.timeout(within_s):
            while True:
                await socket.recv()
    except ConnectionClosed as closed:
        return closed.rcvd.code if closed.rcvd is not None else None
