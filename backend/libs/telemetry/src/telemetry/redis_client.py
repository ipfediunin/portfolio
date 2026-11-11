"""The Redis clients of every service, with one retry policy.

When Redis restarts (or closes an idle connection), the connections in a client's pool are dead,
and the first call on each of them fails. Without a retry that call is lost: the load run right
after the `redis-down` chaos experiment lost the trace part of one order event that way. With it,
the client opens a new connection and repeats the call. Only a broken connection is retried, not
a timeout (a slow or stopped Redis), and only once or twice: when Redis is really down, a request
still fails fast (the Orders API answers 503 within its half-second Redis timeout)."""

from __future__ import annotations

import redis as redis_sync
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.retry import Retry as SyncRetry

RETRIES = 2
_BACKOFF = {"cap": 0.2, "base": 0.02}


def connect_redis(url: str, *, timeout_s: float | None = None, retries: int = RETRIES) -> Redis:
    """An asyncio client (text responses) that survives a Redis restart."""
    return Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=timeout_s,
        socket_timeout=timeout_s,
        retry=Retry(
            ExponentialBackoff(**_BACKOFF), retries, supported_errors=(RedisConnectionError,)
        ),
        retry_on_error=[RedisConnectionError],
    )


def connect_redis_sync(url: str) -> redis_sync.Redis:
    """The same for synchronous code (Django)."""
    return redis_sync.Redis.from_url(
        url,
        decode_responses=True,
        retry=SyncRetry(
            ExponentialBackoff(**_BACKOFF), RETRIES, supported_errors=(RedisConnectionError,)
        ),
        retry_on_error=[RedisConnectionError],
    )
