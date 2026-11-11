"""A Redis client survives Redis closing its connections (a restart): the load run after the
`redis-down` chaos experiment lost a trace part to the first call on a dead pooled connection."""

from __future__ import annotations

import os

import pytest
from redis.asyncio import Redis

from telemetry.redis_client import connect_redis, connect_redis_sync

pytestmark = pytest.mark.integration

REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6380/15")


async def _close_every_connection() -> None:
    """What a Redis restart does to the clients' pooled connections."""
    admin = Redis.from_url(REDIS_URL)
    try:
        await admin.client_kill_filter(_type="normal", skipme=True)
    finally:
        await admin.aclose()


async def test_a_transaction_on_a_closed_connection_is_repeated(clean_state: None) -> None:
    client = connect_redis(REDIS_URL)
    try:
        await client.set("probe", "1")  # the pool now holds an open connection
        await _close_every_connection()
        async with client.pipeline(transaction=True) as pipe:
            pipe.incr("parts")
            pipe.expire("parts", 10)
            assert await pipe.execute() == [1, True]
    finally:
        await client.aclose()


async def test_the_sync_client_repeats_too(clean_state: None) -> None:
    client = connect_redis_sync(REDIS_URL)
    try:
        client.set("probe", "1")
        await _close_every_connection()
        with client.pipeline(transaction=True) as pipe:
            pipe.incr("parts")
            assert pipe.execute() == [1]
    finally:
        client.close()
