"""Token buckets in Redis, checked and consumed atomically by one Lua script.

Several buckets are checked in one call (the client's own and its IP's): a request is let through
only if every bucket has a token, and then each loses one. Time comes from the Redis server, so
every replica of the service sees the same clock.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from redis.asyncio import Redis

from orders_api.settings import RateLimit

_BUCKETS_SCRIPT = """
local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) * 1000 + math.floor(tonumber(now_parts[2]) / 1000)
local allowed = 1
local retry_ms = 0
local levels = {}
for i = 1, #KEYS do
  local capacity = tonumber(ARGV[i * 2 - 1])
  local per_ms = tonumber(ARGV[i * 2]) / 1000
  local state = redis.call('HMGET', KEYS[i], 'tokens', 'ts')
  local tokens = tonumber(state[1]) or capacity
  local ts = tonumber(state[2]) or now
  tokens = math.min(capacity, tokens + math.max(0, now - ts) * per_ms)
  levels[i] = tokens
  if tokens < 1 then
    allowed = 0
    retry_ms = math.max(retry_ms, math.ceil((1 - tokens) / per_ms))
  end
end
for i = 1, #KEYS do
  local capacity = tonumber(ARGV[i * 2 - 1])
  local per_ms = tonumber(ARGV[i * 2]) / 1000
  local tokens = levels[i] - allowed
  levels[i] = tokens
  redis.call('HSET', KEYS[i], 'tokens', tostring(tokens), 'ts', now)
  redis.call('PEXPIRE', KEYS[i], math.ceil(capacity / per_ms) + 1000)
end
return {allowed, math.floor(levels[1]), retry_ms}
"""


@dataclass(frozen=True)
class Verdict:
    allowed: bool
    # Whole tokens left in the first bucket after this request.
    remaining: int
    retry_after_ms: int


@dataclass(frozen=True)
class Bucket:
    key: str
    limit: RateLimit


class TokenBuckets:
    def __init__(self, redis: Redis) -> None:
        self._script = redis.register_script(_BUCKETS_SCRIPT)

    async def take(self, *buckets: Bucket) -> Verdict:
        if not buckets:
            raise ValueError("take() needs at least one bucket")
        args: list[float] = []
        for bucket in buckets:
            args.extend((bucket.limit.capacity, bucket.limit.per_second))
        reply = cast(
            "list[int]",
            await self._script(keys=[f"rl:{bucket.key}" for bucket in buckets], args=args),
        )
        allowed, remaining, retry_after_ms = (int(value) for value in reply)
        return Verdict(
            allowed=allowed == 1, remaining=max(0, remaining), retry_after_ms=retry_after_ms
        )

    @staticmethod
    def key_of(name: str) -> str:
        return f"rl:{name}"
