"""A circuit breaker around the payment provider, shared by every replica through Redis.

closed → (3 failures in a row) → open → (8 s later) → half-open: one trial call; success closes the
circuit, failure opens it again. While open, callers fail fast instead of waiting out a timeout.
Decisions and their bookkeeping run as Lua scripts: atomic, and timed by the Redis server's clock
so replicas agree. Each sandbox has its own breaker, so one visitor's outage demo does not trip
the circuit for everybody else.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, cast

from redis import Redis

from telemetry import span

State = Literal["closed", "open", "half_open"]

FAILURE_THRESHOLD = 3
COOLDOWN_MS = 8000
# A trial that never reported back (its process died) stops blocking new trials after this.
TRIAL_TIMEOUT_MS = 10_000
# The breaker of an idle sandbox is forgotten.
TTL_MS = 30 * 60 * 1000

# KEYS[1] breaker hash · ARGV: cooldown, trial timeout, ttl. Returns {decision, failures}.
_ACQUIRE = """
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HGET', KEYS[1], 'state') or 'closed'
local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')
if state == 'open' then
  if now - tonumber(redis.call('HGET', KEYS[1], 'opened_at')) < tonumber(ARGV[1]) then
    return {'open', failures}
  end
  redis.call('HSET', KEYS[1], 'state', 'half_open', 'trial_at', now)
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {'half_open', failures}
end
if state == 'half_open' then
  if now - tonumber(redis.call('HGET', KEYS[1], 'trial_at')) < tonumber(ARGV[2]) then
    return {'open', failures}
  end
  redis.call('HSET', KEYS[1], 'trial_at', now)
  return {'half_open', failures}
end
return {'closed', failures}
"""

# KEYS[1] breaker hash · ARGV: ok (1/0), threshold, ttl. Returns {state, failures}.
_RECORD = """
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HGET', KEYS[1], 'state') or 'closed'
if ARGV[1] == '1' then
  redis.call('HSET', KEYS[1], 'state', 'closed', 'failures', 0)
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {'closed', 0}
end
local failures = redis.call('HINCRBY', KEYS[1], 'failures', 1)
if state == 'half_open' or failures >= tonumber(ARGV[2]) then
  redis.call('HSET', KEYS[1], 'state', 'open', 'opened_at', now)
  state = 'open'
end
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {state, failures}
"""


@dataclass(frozen=True)
class Reading:
    state: State
    failures: int


def _reading(raw: object) -> Reading:
    state, failures = cast("list[str | int]", raw)
    return Reading(state=cast("State", str(state)), failures=int(failures))


class CircuitBreaker:
    def __init__(self, redis: Redis, scope: str) -> None:
        # Registered scripts run as EVALSHA (loaded once, then called by hash).
        self._acquire = redis.register_script(_ACQUIRE)
        self._record = redis.register_script(_RECORD)
        self._key = f"breaker:{scope}:provider"

    def acquire(self) -> Reading:
        """May the call go ahead? `open`: no (fail fast); `half_open`: yes, as the trial."""
        with span("breaker", "EVALSHA circuit_breaker_acquire") as decision:
            reading = _reading(
                self._acquire(keys=[self._key], args=[COOLDOWN_MS, TRIAL_TIMEOUT_MS, TTL_MS])
            )
            decision.ok = reading.state != "open"
            decision.attributes.update({"state": reading.state, "failures": reading.failures})
        return reading

    def record(self, *, succeeded: bool) -> Reading:
        """The outcome of an allowed call; returns the breaker's state after it."""
        with span("breaker", "EVALSHA circuit_breaker_record") as outcome:
            reading = _reading(
                self._record(
                    keys=[self._key], args=[1 if succeeded else 0, FAILURE_THRESHOLD, TTL_MS]
                )
            )
            outcome.attributes.update({"state": reading.state, "failures": reading.failures})
        return reading
