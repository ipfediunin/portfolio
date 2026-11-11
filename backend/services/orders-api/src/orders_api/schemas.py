"""Request and response bodies. The website's playground validates the same bodies with Zod
(`src/simulation/scenarios/payloads.ts`) and shows the same 422 messages in simulation mode."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from contracts import Currency
from orders_api.repository import OrderRow, ProductRow, TaskRow

Delivery = Literal["standard", "express"]


class OrderIn(BaseModel):
    """A new order. No personal fields on purpose: the live demo never receives personal data."""

    product_id: str = Field(min_length=1, max_length=32, pattern=r"^[a-z0-9-]+$")
    quantity: int = Field(ge=1, le=10)
    delivery: Delivery


def _money(cents: int) -> float:
    return round(cents / 100, 2)


class ProductOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int
    sku: str
    name: str
    price: float
    currency: str

    @classmethod
    def of(cls, row: ProductRow) -> ProductOut:
        return cls(
            id=row.id,
            sku=row.sku,
            name=row.name,
            price=_money(row.price_cents),
            currency=row.currency,
        )


class OrderOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int
    status: str
    product_id: str
    quantity: int
    delivery: str
    total: float
    currency: str
    created_at: datetime
    # Sandbox orders are deleted at this time; the shared demo order never expires.
    expires_at: datetime | None

    @classmethod
    def of(cls, row: OrderRow) -> OrderOut:
        return cls(
            id=row.id,
            status=row.status,
            product_id=row.product_id,
            quantity=row.quantity,
            delivery=row.delivery,
            total=_money(row.total_cents),
            currency=row.currency,
            created_at=row.created_at,
            expires_at=row.expires_at,
        )


class OrderList(BaseModel):
    items: list[OrderOut]
    total: int


class SandboxCreated(BaseModel):
    token: str
    expires_in: int
    # Signs the webhooks the page sends as the payment provider (see contracts.webhooks).
    webhook_secret: str


class SandboxState(BaseModel):
    """What the service holds for this sandbox, shown to the visitor as is."""

    expires_in: int
    orders: int
    cached_entries: int


class ReportIn(BaseModel):
    """A monthly sales report, built in the background."""

    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class PaymentIn(BaseModel):
    """Payment of an order: the amount and currency must match the order (checked in SQL)."""

    order_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    currency: Currency


class TaskAccepted(BaseModel):
    """202: the job is on the queue; its progress is at `Location` (`GET /api/tasks/{id}`)."""

    task_id: UUID
    status: Literal["queued"]


class TaskOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    task_id: UUID
    kind: str
    status: str
    attempts: int
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime

    @classmethod
    def of(cls, row: TaskRow) -> TaskOut:
        return cls(
            task_id=row.id,
            kind=row.kind,
            status=row.status,
            attempts=row.attempts,
            result=row.result,
            error=row.error,
            created_at=row.created_at,
            updated_at=row.updated_at,
            expires_at=row.expires_at,
        )


class Problem(BaseModel):
    detail: str
