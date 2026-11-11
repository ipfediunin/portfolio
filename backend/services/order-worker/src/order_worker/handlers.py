"""What each kind of job does. A handler returns the task's result or raises a classified
failure (`TransientFailure` → retry, `PermanentFailure` → dead-letter queue)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from contracts import ChargeJob, ReportJob
from order_worker.provider import ProviderClient
from order_worker.repository import WorkerRepository


def month_bounds(period: str) -> tuple[datetime, datetime]:
    """`2026-10` → [2026-10-01, 2026-11-01) in UTC."""
    year, month = (int(part) for part in period.split("-"))
    start = datetime(year, month, 1, tzinfo=UTC)
    end = datetime(year + month // 12, month % 12 + 1, 1, tzinfo=UTC)
    return start, end


class Handlers:
    def __init__(self, repository: WorkerRepository, provider: ProviderClient) -> None:
        self._repository = repository
        self._provider = provider

    async def run(self, job: ReportJob | ChargeJob) -> dict[str, Any]:
        match job:
            case ReportJob():
                return await self._report(job)
            case ChargeJob():
                return await self._charge(job)

    async def _report(self, job: ReportJob) -> dict[str, Any]:
        """Sales of the period over the orders the owner can see (shared demo orders and the
        owner's sandbox orders)."""
        start, end = month_bounds(job.period)
        rows = await self._repository.sales(job.owner_key, start, end)
        result = {
            "period": job.period,
            "orders": sum(row.orders for row in rows),
            "revenue": {row.currency: round(row.revenue_cents / 100, 2) for row in rows},
        }
        await self._repository.finish(job.task_id, "succeeded", job.attempt, result=result)
        return result

    async def _charge(self, job: ChargeJob) -> dict[str, Any]:
        charge_id = await self._provider.charge(job)
        result = {
            "charge_id": charge_id,
            "order_id": job.order_id,
            "amount": round(job.amount_cents / 100, 2),
            "currency": job.currency,
        }
        await self._repository.finish(job.task_id, "succeeded", job.attempt, result=result)
        return result
