"""Checkout: the Orders API asks the Payments API (Django) which payment methods an order may use;
the Payments API asks the provider behind a circuit breaker. This is the playground's
circuit-breaker scenario: with the provider down a request waits out the timeout (504); after three
such failures the breaker opens and requests fail at once (503) until a trial call succeeds.

The call carries the trace (W3C `traceparent` and the request's start), so the Payments API's spans
appear in this request's trace."""

from __future__ import annotations

import secrets
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Path, status
from pydantic import BaseModel, ValidationError

from contracts import TRACE_STARTED_AT_HEADER
from orders_api.dependencies import RateLimitedClient, ServicesDep
from orders_api.schemas import Problem
from telemetry import current_trace, span

router = APIRouter(prefix="/api", tags=["checkout"])

OrderId = Annotated[int, Path(ge=1, le=2_147_483_647)]
# Fault injection for the demo: the provider stub stops answering.
ProviderDown = Annotated[bool, Header(alias="X-Fault-Provider-Down")]


class CheckoutOut(BaseModel):
    order_id: int
    payment_methods: list[str]


def _detail(response: httpx.Response, fallback: str) -> str:
    try:
        body = response.json()
    except ValueError:
        return fallback
    detail = body.get("detail") if isinstance(body, dict) else None
    return detail if isinstance(detail, str) else fallback


@router.get(
    "/orders/{order_id}/checkout",
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {"model": Problem},
        status.HTTP_502_BAD_GATEWAY: {"model": Problem},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": Problem, "description": "Breaker open"},
        status.HTTP_504_GATEWAY_TIMEOUT: {"model": Problem, "description": "Provider timed out"},
    },
)
async def checkout(
    order_id: OrderId,
    client: RateLimitedClient,
    services: ServicesDep,
    provider_down: ProviderDown = False,
) -> CheckoutOut:
    with span("handle", "GET /api/orders/{id}/checkout"):
        headers = {
            "X-Internal-Token": services.settings.internal_token.get_secret_value(),
            # The breaker is per client: one visitor's outage demo does not trip it for others.
            "X-Client-Key": client.key,
            "X-Fault-Provider-Down": "true" if provider_down else "false",
        }
        recorder = current_trace.get()
        if recorder is not None:
            headers["traceparent"] = f"00-{recorder.trace_id}-{secrets.token_hex(8)}-01"
            headers[TRACE_STARTED_AT_HEADER] = f"{recorder.started_at:.6f}"
    try:
        answer = await services.payments.get(
            f"/internal/orders/{order_id}/payment-methods", headers=headers
        )
    except httpx.HTTPError as error:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The payments service is unavailable"
        ) from error

    if answer.status_code == status.HTTP_200_OK:
        try:
            return CheckoutOut.model_validate_json(answer.content)
        except ValidationError as error:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The payments service answered unexpectedly"
            ) from error
    if answer.status_code in (status.HTTP_503_SERVICE_UNAVAILABLE, status.HTTP_504_GATEWAY_TIMEOUT):
        passed: dict[str, Any] = {}
        if "retry-after" in answer.headers:
            passed["headers"] = {"Retry-After": answer.headers["retry-after"]}
        raise HTTPException(
            answer.status_code, _detail(answer, "Payment provider is unavailable"), **passed
        )
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The payments service answered unexpectedly")
