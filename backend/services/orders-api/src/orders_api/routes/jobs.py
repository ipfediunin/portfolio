"""Background work: the API validates, records a task, puts a job on RabbitMQ and answers 202
right away; the order worker does the work. Mirrors the playground's async scenarios: a report
(async job) and a payment through the provider (retries, dead-letter queue).

The job carries the request's trace id, so the worker's spans join this request's trace."""

from __future__ import annotations

import secrets
import time
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException, Path, Request, Response, status
from fastapi.exceptions import RequestValidationError

from contracts import ChargeJob, ReportJob
from messaging import QueueFull, QueueUnavailable
from orders_api.dependencies import RateLimitedClient, SandboxClient, Services, ServicesDep
from orders_api.schemas import PaymentIn, Problem, ReportIn, TaskAccepted, TaskOut
from orders_api.validation import validated_body
from telemetry import RequestRecorder, current_trace, span

router = APIRouter(prefix="/api", tags=["jobs"])

_QUEUED: dict[int | str, dict[str, Any]] = {
    status.HTTP_429_TOO_MANY_REQUESTS: {"model": Problem},
    status.HTTP_503_SERVICE_UNAVAILABLE: {"model": Problem, "description": "The queue is full"},
}

OrderId = Annotated[int, Path(ge=1, le=2_147_483_647)]
# Fault injection for the demo: the payment provider stub fails this many calls first.
FaultFailAttempts = Annotated[int, Header(alias="X-Fault-Fail-Attempts", ge=0, le=5)]


def _trace_context() -> tuple[str, float]:
    """The current request's trace id and wall-clock start, for the job to carry."""
    recorder = current_trace.get()
    if recorder is None:
        return secrets.token_hex(16), time.time()
    return recorder.trace_id, recorder.started_at


def _body_schema(model: type[ReportIn] | type[PaymentIn]) -> dict[str, Any]:
    """The body is read inside a traced span (see validation.py); this documents it."""
    return {
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": model.model_json_schema()}},
        }
    }


async def _enqueue(
    services: Services, job: ReportJob | ChargeJob, response: Response
) -> TaskAccepted:
    broker = services.broker
    queue = broker.topology.queue(job.kind)
    try:
        async with span(
            "publish", f"basic.publish {broker.topology.exchange} -> {queue.name} (confirm)"
        ) as step:
            step.attributes["queue"] = queue.name
            await broker.publish_job(job)
    except QueueUnavailable as error:
        # Backpressure: refuse now rather than accept work that cannot be done.
        await services.repository.reject_task(job.task_id, str(error))
        detail = (
            "The job queue is full, try again later"
            if isinstance(error, QueueFull)
            else "The job queue is unavailable, try again later"
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail,
            headers={"Retry-After": str(error.retry_after_s)},
        ) from error
    recorder = current_trace.get()
    if isinstance(recorder, RequestRecorder):
        recorder.queued_background = True
    response.headers["Location"] = f"/api/tasks/{job.task_id}"
    return TaskAccepted(task_id=job.task_id, status="queued")


@router.post(
    "/reports",
    status_code=status.HTTP_202_ACCEPTED,
    responses=_QUEUED,
    openapi_extra=_body_schema(ReportIn),
)
async def create_report(
    request: Request, response: Response, client: RateLimitedClient, services: ServicesDep
) -> TaskAccepted:
    report = await validated_body(request, ReportIn)
    with span("handle", "POST /api/reports"):
        trace_id, started_at = _trace_context()
        job = ReportJob(
            task_id=uuid4(),
            trace_id=trace_id,
            trace_started_at=started_at,
            enqueued_at=time.time(),
            owner_key=client.key,
            period=report.period,
        )
    await services.repository.create_report_task(
        task_id=job.task_id,
        owner=client.key,
        period=job.period,
        ttl_seconds=services.settings.sandbox_ttl_seconds,
    )
    return await _enqueue(services, job, response)


@router.post(
    "/orders/{order_id}/pay",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        **_QUEUED,
        status.HTTP_401_UNAUTHORIZED: {"model": Problem},
        status.HTTP_404_NOT_FOUND: {"model": Problem},
    },
    openapi_extra=_body_schema(PaymentIn),
)
async def pay_order(
    order_id: OrderId,
    *,
    request: Request,
    response: Response,
    client: SandboxClient,
    services: ServicesDep,
    fail_attempts: FaultFailAttempts = 0,
) -> TaskAccepted:
    def matches_path(payment: PaymentIn) -> list[dict[str, Any]]:
        if payment.order_id == order_id:
            return []
        return [
            {
                "type": "value_error",
                "loc": ("body", "order_id"),
                "msg": f"Value error, must be the order in the path ({order_id})",
                "input": payment.order_id,
            }
        ]

    payment = await validated_body(request, PaymentIn, matches_path)
    with span("handle", "POST /api/orders/{id}/pay"):
        trace_id, started_at = _trace_context()
        amount_cents = int(payment.amount * 100)
        job = ChargeJob(
            task_id=uuid4(),
            trace_id=trace_id,
            trace_started_at=started_at,
            enqueued_at=time.time(),
            owner_key=client.key,
            order_id=order_id,
            amount_cents=amount_cents,
            currency=payment.currency,
            fail_attempts=fail_attempts,
        )
    draft = await services.repository.create_charge_task(
        task_id=job.task_id,
        owner=client.key,
        order_id=order_id,
        amount_cents=amount_cents,
        currency=payment.currency,
        fail_attempts=fail_attempts,
        ttl_seconds=services.settings.sandbox_ttl_seconds,
    )
    if draft is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if not draft.created:
        total = f"{Decimal(draft.total_cents) / 100:.2f} {draft.currency}"
        mismatch = "amount" if draft.currency == payment.currency else "currency"
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("body", mismatch),
                    "msg": f"Value error, must match the order total ({total})",
                    "input": str(payment.amount) if mismatch == "amount" else payment.currency,
                }
            ]
        )
    return await _enqueue(services, job, response)


@router.get(
    "/tasks/{task_id}",
    responses={status.HTTP_404_NOT_FOUND: {"model": Problem}},
)
async def read_task(task_id: UUID, client: RateLimitedClient, services: ServicesDep) -> TaskOut:
    """Where a queued job stands. Visible only to the client that created it."""
    row = await services.repository.task(task_id, client.key)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found or expired")
    return TaskOut.of(row)
