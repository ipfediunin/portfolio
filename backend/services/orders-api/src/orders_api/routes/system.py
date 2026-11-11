"""Traces for the website and health endpoints for the container runtime."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from contracts import Trace
from orders_api.dependencies import ClientDep, ServicesDep, limit_by_ip
from orders_api.schemas import Problem

router = APIRouter()

TraceIdParam = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


@router.get(
    "/api/traces/{trace_id}",
    tags=["traces"],
    responses={status.HTTP_404_NOT_FOUND: {"model": Problem}},
)
async def read_trace(trace_id: TraceIdParam, client: ClientDep, services: ServicesDep) -> Trace:
    """A recent trace by id. The 128-bit id is the capability: it is known only to whoever sent
    the request, and the trace disappears after a few minutes."""
    await limit_by_ip(services, client, "trace", services.settings.trace_rate_limit)
    trace = await services.traces.load(trace_id)
    if trace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trace not found or expired")
    return trace


@router.get("/healthz", tags=["health"])
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", tags=["health"], response_model=None)
async def readiness(services: ServicesDep) -> JSONResponse:
    """Ready when PostgreSQL, Redis and RabbitMQ all answer."""
    checks: dict[str, str] = {}
    try:
        await services.redis.ping()
        checks["redis"] = "ok"
    except (RedisError, OSError) as error:
        checks["redis"] = f"unavailable: {type(error).__name__}"
    try:
        async with services.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except (SQLAlchemyError, OSError) as error:
        checks["postgres"] = f"unavailable: {type(error).__name__}"
    checks["rabbitmq"] = "ok" if services.broker.ready else "unavailable: not connected"
    ready = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "not ready", "checks": checks},
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
