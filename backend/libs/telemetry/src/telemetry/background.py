"""Writes the spans of work done after the response into the trace of the request that started
it (Redis, same TTL as the trace): a job's attempts, the outbox relay, the event consumer groups.
The Orders API merges them into `GET /api/traces/{id}`; the website polls until `done`.

The background part is done when its last participant finished: one worker for a job, every
consumer group for an event (`finish_part`).

Tracing never decides the work's fate: if Redis is down, the work still happens and the spans are
lost."""

from __future__ import annotations

import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from contracts import (
    MAX_SPANS,
    TRACES_DONE_CHANNEL,
    TraceSpan,
    background_done_key,
    background_parts_key,
    background_spans_key,
)

logger = logging.getLogger(__name__)


class BackgroundTraces:
    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def append(self, trace_id: str, spans: list[TraceSpan]) -> None:
        if not spans:
            return
        key = background_spans_key(trace_id)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.rpush(key, *(item.model_dump_json() for item in spans))
                pipe.ltrim(key, 0, MAX_SPANS - 1)
                pipe.expire(key, self._ttl)
                await pipe.execute()
        except (RedisError, OSError):
            logger.warning("Could not store %d background spans", len(spans), exc_info=True)

    async def finish(self, trace_id: str) -> None:
        """The work reached its end (a job done or dead-lettered): the trace is complete. The
        realtime hub hears it on `TRACES_DONE_CHANNEL` and tells the page that watches it."""
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.set(background_done_key(trace_id), "1", ex=self._ttl)
                pipe.publish(TRACES_DONE_CHANNEL, trace_id)
                await pipe.execute()
        except (RedisError, OSError):
            logger.warning("Could not mark the background trace as done", exc_info=True)

    async def finish_part(self, trace_id: str, parts: int) -> None:
        """One of `parts` participants finished; the last one completes the trace."""
        key = background_parts_key(trace_id)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, self._ttl)
                finished, _ = await pipe.execute()
        except (RedisError, OSError):
            logger.warning("Could not count a finished part of the trace", exc_info=True)
            return
        if int(finished) >= parts:
            await self.finish(trace_id)
