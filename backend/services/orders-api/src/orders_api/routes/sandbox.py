"""Anonymous sandboxes: a random token instead of an account. The service stores only the token's
hash, for `sandbox_ttl_seconds`; everything made in the sandbox goes with it."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from contracts import token_hash
from orders_api.dependencies import ClientDep, Services, ServicesDep, limit_by_ip
from orders_api.identity import Client, new_token
from orders_api.schemas import Problem, SandboxCreated, SandboxState

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])

_UNAUTHORIZED: dict[int | str, dict[str, Any]] = {status.HTTP_401_UNAUTHORIZED: {"model": Problem}}


async def _require(client: Client, services: Services) -> str:
    await limit_by_ip(services, client, "sandbox-admin", services.settings.sandbox_admin_rate_limit)
    if client.token_hash is None or not await services.sandboxes.verify(client.token_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return client.token_hash


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_sandbox(client: ClientDep, services: ServicesDep) -> SandboxCreated:
    await limit_by_ip(services, client, "sandbox-create", services.settings.sandbox_rate_limit)
    token = new_token()
    record = await services.sandboxes.create(token_hash(token))
    return SandboxCreated(
        token=token,
        expires_in=services.sandboxes.ttl_seconds,
        webhook_secret=record.webhook_secret,
    )


@router.get("", responses=_UNAUTHORIZED)
async def read_sandbox(client: ClientDep, services: ServicesDep) -> SandboxState:
    hashed = await _require(client, services)
    expires_in = await services.sandboxes.seconds_left(hashed) or 0
    return SandboxState(
        expires_in=expires_in,
        orders=await services.repository.count_owned(client.key),
        cached_entries=await services.sandboxes.count_cached(client.key),
    )


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT, responses=_UNAUTHORIZED)
async def reset_sandbox(client: ClientDep, services: ServicesDep) -> None:
    """Clears the sandbox's cache and refills its rate-limit bucket (the per-IP cap stays)."""
    await _require(client, services)
    await services.sandboxes.forget_client_state(client.key)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, responses=_UNAUTHORIZED)
async def delete_sandbox(client: ClientDep, services: ServicesDep) -> None:
    """Deletes everything now instead of waiting for the TTL."""
    hashed = await _require(client, services)
    await services.repository.delete_owned(client.key)
    await services.sandboxes.forget_client_state(client.key)
    await services.sandboxes.delete(hashed, client.key)
