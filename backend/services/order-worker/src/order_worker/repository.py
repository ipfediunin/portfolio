"""SQL of the worker. The worker is part of the orders domain (a separate deployable so it can
scale on its own) and works on the Orders API's schema. Statements are written out in full: the
text in a trace is the statement that ran.

Finishing a task is conditional (`status = 'queued'`): a job delivered twice cannot overwrite the
outcome of the first delivery."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeout
from sqlalchemy.ext.asyncio import AsyncEngine

from order_worker.failures import TransientFailure
from telemetry import span

_SALES = text(
    """
    SELECT currency, count(*) AS orders, coalesce(sum(total_cents), 0) AS revenue_cents
    FROM orders.orders
    WHERE (owner_key IS NULL OR owner_key = :owner)
      AND created_at >= :period_start AND created_at < :period_end
    GROUP BY currency
    ORDER BY currency
    """
)

_FINISH_TASK = text(
    """
    UPDATE orders.tasks
    SET status = :status, attempts = :attempts, result = CAST(:result AS jsonb),
        error = :error, updated_at = now()
    WHERE id = :id AND status = 'queued'
    """
)


def _label(statement: Any) -> str:
    return " ".join(str(statement).split())


@dataclass(frozen=True)
class SalesRow:
    currency: str
    orders: int
    revenue_cents: int


class DatabaseUnavailable(TransientFailure):
    pass


# Connection-level problems: the database may be back for the next attempt. Errors about the data
# itself (constraints, types) are not caught here and dead-letter the job.
UNAVAILABLE = (OperationalError, InterfaceError, PoolTimeout, OSError)


class WorkerRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def sales(self, owner: str, start: datetime, end: datetime) -> list[SalesRow]:
        params = {"owner": owner, "period_start": start, "period_end": end}
        try:
            async with span("db", _label(_SALES)), self._engine.connect() as connection:
                rows = (await connection.execute(_SALES, params)).mappings().all()
        except UNAVAILABLE as error:
            raise DatabaseUnavailable("PostgreSQL is not available") from error
        return [SalesRow(**row) for row in rows]

    async def finish(
        self,
        task_id: UUID,
        status: Literal["succeeded", "failed"],
        attempts: int,
        *,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> bool:
        """Records the outcome; False when the task was already finished (a redelivery)."""
        params = {
            "id": task_id,
            "status": status,
            "attempts": attempts,
            "result": json.dumps(result) if result is not None else None,
            "error": error[:200] if error else None,
        }
        try:
            async with span("db", _label(_FINISH_TASK)), self._engine.begin() as connection:
                updated = (await connection.execute(_FINISH_TASK, params)).rowcount
        except UNAVAILABLE as error_:
            raise DatabaseUnavailable("PostgreSQL is not available") from error_
        return bool(updated)
