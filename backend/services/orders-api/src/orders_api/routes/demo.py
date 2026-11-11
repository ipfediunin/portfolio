"""The demo routes the website's playground calls in live mode. Each one mirrors a playground
scenario: read an order (sync read, auth), list orders, create an order (validation), read a
product through the cache (cache, rate limit)."""

from __future__ import annotations

import secrets
import time
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Request, Response, status

from contracts import ORDER_EVENTS_TOPIC
from orders_api.dependencies import RateLimitedClient, SandboxClient, ServicesDep
from orders_api.schemas import OrderIn, OrderList, OrderOut, Problem, ProductOut
from orders_api.validation import validated_body
from telemetry import RequestRecorder, current_trace, span

router = APIRouter(prefix="/api", tags=["demo"])

_ERRORS: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"model": Problem},
    status.HTTP_429_TOO_MANY_REQUESTS: {"model": Problem},
}
_PROTECTED_ERRORS = {**_ERRORS, status.HTTP_401_UNAUTHORIZED: {"model": Problem}}

Id = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("/orders/{order_id}", responses=_PROTECTED_ERRORS)
async def read_order(order_id: Id, client: SandboxClient, services: ServicesDep) -> OrderOut:
    with span("handle", "GET /api/orders/{id}"):
        owner = client.key
    row = await services.repository.order(order_id, owner)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return OrderOut.of(row)


@router.get("/orders", responses=_PROTECTED_ERRORS)
async def list_orders(client: SandboxClient, services: ServicesDep) -> OrderList:
    with span("handle", "GET /api/orders"):
        owner = client.key
    rows = await services.repository.visible_orders(owner)
    return OrderList(items=[OrderOut.of(row) for row in rows], total=len(rows))


@router.post(
    "/orders",
    status_code=status.HTTP_201_CREATED,
    responses=_ERRORS,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": OrderIn.model_json_schema()}},
        }
    },
)
async def create_order(
    request: Request, client: RateLimitedClient, services: ServicesDep
) -> OrderOut:
    order = await validated_body(request, OrderIn)
    with span("handle", "POST /api/orders"):
        settings = services.settings
        recorder = current_trace.get()
        trace_id = recorder.trace_id if recorder else secrets.token_hex(16)
        started_at = recorder.started_at if recorder else time.time()
    row = await services.repository.create_order(
        sku=order.product_id,
        quantity=order.quantity,
        delivery=order.delivery,
        owner=client.key,
        ttl_seconds=settings.sandbox_ttl_seconds,
        topic=f"{settings.queue_prefix}{ORDER_EVENTS_TOPIC}",
        trace_id=trace_id,
        trace_started_at=started_at,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {order.product_id!r} not found")
    # The order.created event is in the outbox: the relay and the consumer groups add their part.
    if isinstance(recorder, RequestRecorder):
        recorder.queued_background = True
    return OrderOut.of(row)


@router.get("/products/{product_id}", responses=_ERRORS)
async def read_product(
    product_id: Id,
    request: Request,
    response: Response,
    client: RateLimitedClient,
    services: ServicesDep,
) -> ProductOut:
    """Read-through cache. `Cache-Control: no-cache` skips the cache read, as HTTP intends."""
    with span("handle", "GET /api/products/{id}"):
        bypass = "no-cache" in request.headers.get("cache-control", "").lower()
    if not bypass:
        cached = await services.products.get(client.key, product_id)
        if cached is not None:
            response.headers["X-Cache"] = "HIT"
            return ProductOut.model_validate(cached)
    row = await services.repository.product(product_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    product = ProductOut.of(row)
    await services.products.set(client.key, product_id, product.model_dump())
    response.headers["X-Cache"] = "BYPASS" if bypass else "MISS"
    return product
