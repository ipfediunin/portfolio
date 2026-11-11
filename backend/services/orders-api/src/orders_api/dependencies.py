"""The shared resources of the app and the gateway checks every demo route goes through:
rate limit first, then (for protected routes) the sandbox token — the same order as in the city."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from messaging import Broker
from orders_api.identity import Client, identify
from orders_api.rate_limit import Bucket, TokenBuckets
from orders_api.redis_stores import ProductCache, SandboxStore, TraceStore
from orders_api.repository import Repository
from orders_api.settings import RateLimit, Settings
from telemetry import span


@dataclass(frozen=True)
class Services:
    settings: Settings
    redis: Redis
    engine: AsyncEngine
    repository: Repository
    sandboxes: SandboxStore
    products: ProductCache
    traces: TraceStore
    buckets: TokenBuckets
    broker: Broker
    payments: httpx.AsyncClient


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]


def get_client(request: Request, services: ServicesDep) -> Client:
    return identify(request, services.settings.ip_hash_secret.get_secret_value().encode())


ClientDep = Annotated[Client, Depends(get_client)]


def _too_many(retry_after_ms: int, limit: RateLimit) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too Many Requests",
        headers={
            "Retry-After": str(max(1, math.ceil(retry_after_ms / 1000))),
            "X-RateLimit-Limit": str(limit.capacity),
            "X-RateLimit-Remaining": "0",
        },
    )


async def rate_limited(client: ClientDep, services: ServicesDep, response: Response) -> Client:
    """The client's own bucket and its IP's bucket, checked in one atomic Redis call."""
    limits = services.settings
    async with span("rate_limit", "EVALSHA token_buckets (client, ip)") as check:
        verdict = await services.buckets.take(
            Bucket(f"client:{client.key}", limits.client_rate_limit),
            Bucket(f"ipcap:{client.ip_key}", limits.ip_rate_limit),
        )
        check.ok = verdict.allowed
        check.attributes["remaining"] = verdict.remaining
    if not verdict.allowed:
        raise _too_many(verdict.retry_after_ms, limits.client_rate_limit)
    response.headers["X-RateLimit-Limit"] = str(limits.client_rate_limit.capacity)
    response.headers["X-RateLimit-Remaining"] = str(verdict.remaining)
    return client


RateLimitedClient = Annotated[Client, Depends(rate_limited)]


async def sandbox_client(client: RateLimitedClient, services: ServicesDep) -> Client:
    """Protected routes: a live sandbox token is required."""
    if not await services.sandboxes.verify(client.token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return client


SandboxClient = Annotated[Client, Depends(sandbox_client)]


async def limit_by_ip(services: Services, client: Client, name: str, limit: RateLimit) -> None:
    """Service routes (sandbox, traces) have their own per-IP budget, outside the demo's."""
    verdict = await services.buckets.take(Bucket(f"{name}:{client.ip_key}", limit))
    if not verdict.allowed:
        raise _too_many(verdict.retry_after_ms, limit)
