"""Everything the service keeps in Redis. All of it expires on its own: sandboxes after their TTL,
cached products after seconds, traces after minutes. Redis runs without persistence, so none of it
is ever written to disk."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from typing import Any, cast

from pydantic import ValidationError
from redis.asyncio import Redis

from contracts import (
    Background,
    SandboxRecord,
    Trace,
    TraceSpan,
    background_done_key,
    background_spans_key,
    notifications_key,
    remote_spans_key,
    sandbox_key,
    trace_key,
)
from telemetry import span


def _cache_prefix(client_key: str) -> str:
    return f"cache:{client_key}:"


class SandboxStore:
    """Anonymous sandboxes: the key is the SHA-256 of the token; the value holds the creation time
    and the secret that signs the sandbox's webhooks (read by the Payments API)."""

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self.ttl_seconds = ttl_seconds

    async def create(self, token_hash: str) -> SandboxRecord:
        record = SandboxRecord(
            created_at=datetime.now(UTC).replace(microsecond=0),
            webhook_secret=secrets.token_urlsafe(32),
        )
        stored = await self._redis.set(
            sandbox_key(token_hash), record.model_dump_json(), ex=self.ttl_seconds, nx=True
        )
        if not stored:
            raise RuntimeError("Sandbox token collision")  # 256-bit tokens: practically never
        return record

    async def seconds_left(self, token_hash: str) -> int | None:
        """Remaining lifetime of a sandbox, or None if it does not exist (expired or deleted)."""
        ttl = await self._redis.ttl(sandbox_key(token_hash))
        return ttl if ttl > 0 else None

    async def verify(self, token_hash: str | None) -> bool:
        """The traced check behind protected routes."""
        async with span("auth", "GET sandbox:<token sha256>") as check:
            exists = token_hash is not None and bool(
                await self._redis.exists(sandbox_key(token_hash))
            )
            check.ok = exists
            check.attributes["token"] = "valid" if exists else "missing or expired"
        return exists

    async def forget_client_state(self, client_key: str) -> int:
        """Deletes the client's cache entries and rate-limit bucket; returns how many keys went."""
        keys: list[str] = [f"rl:client:{client_key}"]
        async for key in self._redis.scan_iter(match=f"{_cache_prefix(client_key)}*", count=100):
            keys.append(key if isinstance(key, str) else key.decode())
        return await self._redis.delete(*keys)

    async def count_cached(self, client_key: str) -> int:
        count = 0
        async for _ in self._redis.scan_iter(match=f"{_cache_prefix(client_key)}*", count=100):
            count += 1
        return count

    async def delete(self, token_hash: str, client_key: str) -> None:
        """The sandbox and what the event consumers queued for it."""
        await self._redis.delete(sandbox_key(token_hash), notifications_key(client_key))


class ProductCache:
    """Read-through cache of products. Each client gets its own namespace, so one visitor's cache
    hits never show up in another visitor's demo."""

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def _key(client_key: str, product_id: int) -> str:
        return f"{_cache_prefix(client_key)}product:{product_id}"

    async def get(self, client_key: str, product_id: int) -> dict[str, Any] | None:
        async with span("cache_get", f"GET cache:<client>:product:{product_id}") as lookup:
            raw = await self._redis.get(self._key(client_key, product_id))
            lookup.attributes["hit"] = raw is not None
        if raw is None:
            return None
        return cast("dict[str, Any]", json.loads(raw))

    async def set(self, client_key: str, product_id: int, value: dict[str, Any]) -> None:
        name = f"SET cache:<client>:product:{product_id} EX {self.ttl_seconds}"
        async with span("cache_set", name):
            await self._redis.set(
                self._key(client_key, product_id), json.dumps(value), ex=self.ttl_seconds
            )


class TraceStore:
    """Traces for the website. The API stores the synchronous part; services it called append
    theirs (the Payments API), workers append the spans of the work the request queued
    (`telemetry.background`), and `load` puts them together."""

    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self._redis = redis
        self.ttl_seconds = ttl_seconds

    async def save(self, trace: Trace) -> None:
        await self._redis.set(
            trace_key(trace.trace_id), trace.model_dump_json(), ex=self.ttl_seconds
        )

    async def load(self, trace_id: str) -> Trace | None:
        async with self._redis.pipeline(transaction=False) as pipe:
            pipe.get(trace_key(trace_id))
            pipe.lrange(remote_spans_key(trace_id), 0, -1)
            pipe.lrange(background_spans_key(trace_id), 0, -1)
            pipe.exists(background_done_key(trace_id))
            raw, remote_spans, background_spans, done = await pipe.execute()
        if raw is None:
            return None
        try:
            trace = Trace.model_validate_json(raw)
            update: dict[str, object] = {}
            if remote_spans:
                remote = [TraceSpan.model_validate_json(item) for item in remote_spans]
                # One clock for every service: ordered by start, the spans read as one request.
                update["spans"] = sorted([*trace.spans, *remote], key=lambda item: item.start_ms)
            if trace.background is not None:
                background = [TraceSpan.model_validate_json(item) for item in background_spans]
                update["background"] = Background(
                    state="done" if done else "pending",
                    # Participants append as they finish (consumer groups run side by side):
                    # ordered by start, the event is published before anyone consumes it.
                    spans=sorted(background, key=lambda item: item.start_ms),
                )
            return trace.model_copy(update=update) if update else trace
        except ValidationError as error:
            raise RuntimeError(f"Stored trace {trace_id} does not match the contract") from error
