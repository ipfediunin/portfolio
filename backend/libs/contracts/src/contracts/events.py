"""Domain events: what has happened, published to Kafka through a transactional outbox.

`order.created` is written in the same transaction as the order (the Orders API's outbox), relayed
to the `orders.events` topic keyed by the order id (one order's events stay in one partition, in
order) and read by independent consumer groups. Delivery is at-least-once: consumers recognise a
repeated event by its `event_id`.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from contracts.trace import TraceId

ORDER_EVENTS_TOPIC = "orders.events"
ORDER_EVENTS_PARTITIONS = 3
# The consumer groups reading orders.events.
ORDER_EVENT_GROUPS = ("inventory", "analytics", "notifications")
# Who writes into the background part of the trace that created an order: the outbox relay and
# every consumer group. The part is done when all of them have.
ORDER_EVENT_TRACE_PARTS = 1 + len(ORDER_EVENT_GROUPS)


class OrderCreated(BaseModel):
    """No personal data: the order's demo fields and the hashed sandbox key."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    event_id: UUID
    type: Literal["order.created"]
    occurred_at: datetime
    order_id: int = Field(ge=1)
    product_id: str = Field(min_length=1, max_length=32)
    quantity: int = Field(ge=1, le=10)
    delivery: Literal["standard", "express"]
    total_cents: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    owner_key: str = Field(min_length=1, max_length=40)
    # The request that created the order: consumers record their spans into its trace.
    trace_id: TraceId
    trace_started_at: float = Field(gt=0)


def background_parts_key(trace_id: str) -> str:
    """How many participants finished their part of the trace's background work."""
    return f"trace:{trace_id}:background:finished"
