"""Process-wide clients, created on first use. Tests change the settings and call `reset()`."""

from __future__ import annotations

from functools import cache

import httpx
from django.conf import settings
from redis import Redis

from backoffice.payments.provider import ProviderClient
from telemetry.redis_client import connect_redis_sync


@cache
def redis() -> Redis:
    return connect_redis_sync(settings.REDIS_URL)


@cache
def provider() -> ProviderClient:
    transport = settings.PROVIDER_TRANSPORT
    if transport is not None and not isinstance(transport, httpx.BaseTransport):
        raise TypeError("PROVIDER_TRANSPORT must be an httpx transport")
    return ProviderClient(
        httpx.Client(
            base_url=settings.PROVIDER_URL,
            timeout=settings.PROVIDER_TIMEOUT_SECONDS,
            transport=transport,
        )
    )


def reset() -> None:
    redis.cache_clear()
    provider.cache_clear()
