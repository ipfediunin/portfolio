"""Job messages: what the Orders API puts on the queue and the workers take from it.

A job carries everything the worker needs, so handling it never depends on reading back the
request. It also carries the trace it belongs to: the worker records its spans into that trace.
No personal data: owners are opaque client keys (hashes), payloads are demo fields.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from contracts.trace import TraceId

Currency = Literal["EUR", "USD", "RUB"]
JobKind = Literal["report", "charge"]


class _Job(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    task_id: UUID
    trace_id: TraceId
    # Epoch seconds when the request started: workers place their spans on the request's clock.
    trace_started_at: float = Field(gt=0)
    # Epoch seconds when this copy was put on a queue (first publish or a retry).
    enqueued_at: float = Field(gt=0)
    # The client the task belongs to (a hashed sandbox token or a hashed IP).
    owner_key: str = Field(min_length=1, max_length=40)
    attempt: int = Field(default=1, ge=1, le=10)


class ReportJob(_Job):
    """Monthly sales report over the orders the owner can see."""

    kind: Literal["report"] = "report"
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class ChargeJob(_Job):
    """Charge an order through the payment provider."""

    kind: Literal["charge"] = "charge"
    order_id: int = Field(ge=1)
    amount_cents: int = Field(ge=1)
    currency: Currency
    # Fault injection for the demo: the provider stub fails this many calls before it succeeds.
    fail_attempts: int = Field(default=0, ge=0, le=5)


Job = Annotated[ReportJob | ChargeJob, Field(discriminator="kind")]
JOB_ADAPTER: TypeAdapter[ReportJob | ChargeJob] = TypeAdapter(Job)
