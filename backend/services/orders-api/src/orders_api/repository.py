"""SQL of the Orders API. Statements are written out in full: the text you see in a trace is the
statement that ran. Orders and tasks made in a sandbox belong to the client key and expire with
it. Background tasks are finished by the order worker, which works on this schema too."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import RowMapping, text
from sqlalchemy.ext.asyncio import AsyncEngine

from telemetry import span

_PRODUCT_BY_ID = text(
    """
    SELECT id, sku, name, price_cents, currency
    FROM orders.product_snapshots
    WHERE id = :id
    """
)

_ORDER_COLUMNS = """
    o.id, o.status, p.sku AS product_id, o.quantity, o.delivery,
    o.total_cents, o.currency, o.created_at, o.expires_at
"""

_ORDER_BY_ID = text(
    f"""
    SELECT {_ORDER_COLUMNS}
    FROM orders.orders o JOIN orders.product_snapshots p ON p.id = o.product_id
    WHERE o.id = :id AND (o.owner_key IS NULL OR o.owner_key = :owner)
    """  # noqa: S608 — a constant column list, values are bound parameters
)

_ORDERS_VISIBLE = text(
    f"""
    SELECT {_ORDER_COLUMNS}
    FROM orders.orders o JOIN orders.product_snapshots p ON p.id = o.product_id
    WHERE o.owner_key IS NULL OR o.owner_key = :owner
    ORDER BY o.id DESC
    LIMIT 20
    """  # noqa: S608
)

# One statement: the product lookup, the order and its order.created event (the transactional
# outbox) happen together. A missing product inserts nothing; an order never exists without its
# event, nor an event without its order. The relay publishes the event to Kafka afterwards.
_CREATE_ORDER = text(
    """
    WITH created AS (
        INSERT INTO orders.orders
            (product_id, quantity, delivery, status, total_cents, currency, owner_key, expires_at)
        SELECT p.id, CAST(:quantity AS integer), CAST(:delivery AS text), 'created',
               p.price_cents * CAST(:quantity AS integer), p.currency,
               CAST(:owner AS text), now() + make_interval(secs => CAST(:ttl AS integer))
        FROM orders.product_snapshots p
        WHERE p.sku = :sku
        RETURNING *
    ), event AS (
        INSERT INTO orders.outbox (topic, key, payload)
        SELECT CAST(:topic AS text), CAST(c.id AS text), jsonb_build_object(
            'event_id', gen_random_uuid(), 'type', 'order.created', 'occurred_at', c.created_at,
            'order_id', c.id, 'product_id', p.sku, 'quantity', c.quantity,
            'delivery', c.delivery, 'total_cents', c.total_cents, 'currency', c.currency,
            'owner_key', c.owner_key, 'trace_id', CAST(:trace_id AS text),
            'trace_started_at', CAST(:trace_started_at AS double precision))
        FROM created c JOIN orders.product_snapshots p ON p.id = c.product_id
    )
    SELECT c.id, c.status, p.sku AS product_id, c.quantity, c.delivery,
           c.total_cents, c.currency, c.created_at, c.expires_at
    FROM created c JOIN orders.product_snapshots p ON p.id = c.product_id
    """
)
# Its outline for the trace: the full text is cut at 200 characters, before the outbox INSERT.
_CREATE_ORDER_OUTLINE = (
    "WITH created AS (INSERT INTO orders.orders …), "
    "event AS (INSERT INTO orders.outbox …) SELECT … FROM created"
)

_COUNT_OWNED = text("SELECT count(*) FROM orders.orders WHERE owner_key = :owner")
_DELETE_OWNED_TASKS = text("DELETE FROM orders.tasks WHERE owner_key = :owner")
_DELETE_OWNED = text("DELETE FROM orders.orders WHERE owner_key = :owner")
_DELETE_EXPIRED_TASKS = text("DELETE FROM orders.tasks WHERE expires_at < now()")
# Published events and the consumers' bookkeeping outlive the sandbox only briefly; the daily sales
# counters are aggregates without an owner and are kept for a month.
_DELETE_PUBLISHED_EVENTS = text(
    "DELETE FROM orders.outbox WHERE published_at < now() - interval '10 minutes'"
)
_DELETE_PROCESSED_EVENTS = text(
    "DELETE FROM orders.processed_events WHERE processed_at < now() - interval '1 day'"
)
_DELETE_OLD_SALES = text("DELETE FROM orders.daily_sales WHERE day < current_date - 30")
_DELETE_EXPIRED = text("DELETE FROM orders.orders WHERE expires_at < now()")

_TASK_EXPIRY = "now() + make_interval(secs => CAST(:ttl AS integer))"

_CREATE_REPORT_TASK = text(
    f"""
    INSERT INTO orders.tasks (id, kind, owner_key, params, status, expires_at)
    VALUES (CAST(:id AS uuid), 'report', CAST(:owner AS text), CAST(:params AS jsonb), 'queued',
            {_TASK_EXPIRY})
    """  # noqa: S608 — a constant expression, values are bound parameters
)

# One statement: the order lookup, the amount check and the insert happen together. The result
# tells the three outcomes apart: no row (no such order), `created` false (the amount does not
# match the order), `created` true.
_CREATE_CHARGE_TASK = text(
    f"""
    WITH target AS (
        SELECT id, total_cents, currency
        FROM orders.orders
        WHERE id = :order_id AND (owner_key IS NULL OR owner_key = :owner)
    ), created AS (
        INSERT INTO orders.tasks (id, kind, owner_key, order_id, params, status, expires_at)
        SELECT CAST(:id AS uuid), 'charge', CAST(:owner AS text), target.id,
               CAST(:params AS jsonb), 'queued', {_TASK_EXPIRY}
        FROM target
        WHERE target.total_cents = CAST(:amount_cents AS integer)
          AND target.currency = CAST(:currency AS text)
        RETURNING id
    )
    SELECT target.total_cents, target.currency, created.id IS NOT NULL AS created
    FROM target LEFT JOIN created ON true
    """  # noqa: S608
)

_TASK_BY_ID = text(
    """
    SELECT id, kind, status, attempts, result, error, created_at, updated_at, expires_at
    FROM orders.tasks
    WHERE id = :id AND owner_key = :owner
    """
)

_REJECT_TASK = text(
    """
    UPDATE orders.tasks SET status = 'rejected', error = :error, updated_at = now()
    WHERE id = :id AND status = 'queued'
    """
)


def _label(statement: Any) -> str:
    return " ".join(str(statement).split())


@dataclass(frozen=True)
class ProductRow:
    id: int
    sku: str
    name: str
    price_cents: int
    currency: str


@dataclass(frozen=True)
class OrderRow:
    id: int
    status: str
    product_id: str
    quantity: int
    delivery: str
    total_cents: int
    currency: str
    created_at: datetime
    expires_at: datetime | None


def _order(row: RowMapping) -> OrderRow:
    return OrderRow(**{field: row[field] for field in OrderRow.__dataclass_fields__})


@dataclass(frozen=True)
class TaskRow:
    id: UUID
    kind: str
    status: str
    attempts: int
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class ChargeDraft:
    """What creating a charge task found: the order's total, and whether the task was created
    (it is not when the amount or currency does not match the order)."""

    total_cents: int
    currency: str
    created: bool


class Repository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def product(self, product_id: int) -> ProductRow | None:
        async with span("db", _label(_PRODUCT_BY_ID)), self._engine.connect() as connection:
            row = (await connection.execute(_PRODUCT_BY_ID, {"id": product_id})).mappings().first()
        return ProductRow(**row) if row else None

    async def order(self, order_id: int, owner: str) -> OrderRow | None:
        async with span("db", _label(_ORDER_BY_ID)), self._engine.connect() as connection:
            result = await connection.execute(_ORDER_BY_ID, {"id": order_id, "owner": owner})
            row = result.mappings().first()
        return _order(row) if row else None

    async def visible_orders(self, owner: str) -> list[OrderRow]:
        async with span("db", _label(_ORDERS_VISIBLE)), self._engine.connect() as connection:
            rows = (await connection.execute(_ORDERS_VISIBLE, {"owner": owner})).mappings().all()
        return [_order(row) for row in rows]

    async def create_order(
        self,
        *,
        sku: str,
        quantity: int,
        delivery: str,
        owner: str,
        ttl_seconds: int,
        topic: str,
        trace_id: str,
        trace_started_at: float,
    ) -> OrderRow | None:
        """Inserts the order and its order.created event; None when the product does not exist."""
        params = {
            "sku": sku,
            "quantity": quantity,
            "delivery": delivery,
            "owner": owner,
            "ttl": ttl_seconds,
            "topic": topic,
            "trace_id": trace_id,
            "trace_started_at": trace_started_at,
        }
        async with span("db", _CREATE_ORDER_OUTLINE), self._engine.begin() as connection:
            row = (await connection.execute(_CREATE_ORDER, params)).mappings().first()
        return _order(row) if row else None

    async def create_report_task(
        self, *, task_id: UUID, owner: str, period: str, ttl_seconds: int
    ) -> None:
        params = {
            "id": task_id,
            "owner": owner,
            "params": json.dumps({"period": period}),
            "ttl": ttl_seconds,
        }
        async with span("db", _label(_CREATE_REPORT_TASK)), self._engine.begin() as connection:
            await connection.execute(_CREATE_REPORT_TASK, params)

    async def create_charge_task(
        self,
        *,
        task_id: UUID,
        owner: str,
        order_id: int,
        amount_cents: int,
        currency: str,
        fail_attempts: int,
        ttl_seconds: int,
    ) -> ChargeDraft | None:
        """None when the order does not exist or is not visible to the owner."""
        params = {
            "id": task_id,
            "owner": owner,
            "order_id": order_id,
            "amount_cents": amount_cents,
            "currency": currency,
            "params": json.dumps(
                {"amount_cents": amount_cents, "currency": currency, "fail_attempts": fail_attempts}
            ),
            "ttl": ttl_seconds,
        }
        async with span("db", _label(_CREATE_CHARGE_TASK)), self._engine.begin() as connection:
            row = (await connection.execute(_CREATE_CHARGE_TASK, params)).mappings().first()
        return ChargeDraft(**row) if row else None

    async def task(self, task_id: UUID, owner: str) -> TaskRow | None:
        async with self._engine.connect() as connection:
            result = await connection.execute(_TASK_BY_ID, {"id": task_id, "owner": owner})
            row = result.mappings().first()
        return TaskRow(**row) if row else None

    async def reject_task(self, task_id: UUID, reason: str) -> None:
        """The broker did not take the job: the task will never run."""
        async with span("db", _label(_REJECT_TASK)), self._engine.begin() as connection:
            await connection.execute(_REJECT_TASK, {"id": task_id, "error": reason[:200]})

    async def count_owned(self, owner: str) -> int:
        async with self._engine.connect() as connection:
            return int((await connection.execute(_COUNT_OWNED, {"owner": owner})).scalar_one())

    async def delete_owned(self, owner: str) -> int:
        """Deletes the owner's tasks and orders; returns how many orders went."""
        async with self._engine.begin() as connection:
            await connection.execute(_DELETE_OWNED_TASKS, {"owner": owner})
            return (await connection.execute(_DELETE_OWNED, {"owner": owner})).rowcount

    async def delete_expired(self) -> int:
        """Deletes expired tasks and orders; returns how many rows went."""
        async with self._engine.begin() as connection:
            deleted = 0
            for statement in (
                _DELETE_EXPIRED_TASKS,
                _DELETE_EXPIRED,
                _DELETE_PUBLISHED_EVENTS,
                _DELETE_PROCESSED_EVENTS,
                _DELETE_OLD_SALES,
            ):
                deleted += (await connection.execute(statement)).rowcount
            return deleted
