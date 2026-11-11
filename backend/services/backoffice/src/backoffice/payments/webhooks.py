"""Applying a provider webhook: at most once per event, and only along the payment state machine.

Two statements in one transaction. The first records the event and does nothing for an event id
already seen (the unique constraint decides, so concurrent deliveries cannot both win). The second
moves the payment to its new status only from a status allowed to reach it (`sources_of`); when
the move is not allowed, nothing is kept — not even the event — and the caller answers 409.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db import connection, transaction

from backoffice.payments.models import PaymentStatus, sources_of
from contracts import WebhookEvent

_RECORD_EVENT = """
    INSERT INTO backoffice.webhook_events
        (owner_key, event_id, type, order_id, received_at, expires_at)
    VALUES (%s, %s, %s, %s, now(), now() + make_interval(secs => %s))
    ON CONFLICT (owner_key, event_id) DO NOTHING
    RETURNING id
"""

_MOVE_PAYMENT = """
    INSERT INTO backoffice.payments AS p
        (owner_key, order_id, status, last_event_id, created_at, updated_at, expires_at)
    VALUES (%s, %s, %s, %s, now(), now(), now() + make_interval(secs => %s))
    ON CONFLICT (owner_key, order_id) DO UPDATE
        SET status = EXCLUDED.status, last_event_id = EXCLUDED.last_event_id, updated_at = now()
        WHERE p.status = ANY(%s)
    RETURNING p.status
"""

_CURRENT_STATUS = """
    SELECT status FROM backoffice.payments WHERE owner_key = %s AND order_id = %s
"""


@dataclass(frozen=True)
class Applied:
    status: str


@dataclass(frozen=True)
class Duplicate:
    pass


@dataclass(frozen=True)
class Refused:
    """The payment's status may not change this way (e.g. succeeded → failed)."""

    current: str
    requested: str


def target_status(event: WebhookEvent) -> str:
    return PaymentStatus.SUCCEEDED if event.type == "payment.succeeded" else PaymentStatus.FAILED


def apply(owner_key: str, event: WebhookEvent, ttl_seconds: int) -> Applied | Duplicate | Refused:
    target = target_status(event)
    order_id = event.data.order_id
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(_RECORD_EVENT, [owner_key, event.id, event.type, order_id, ttl_seconds])
        if cursor.fetchone() is None:
            return Duplicate()
        cursor.execute(
            _MOVE_PAYMENT, [owner_key, order_id, target, event.id, ttl_seconds, sources_of(target)]
        )
        if cursor.fetchone() is not None:
            return Applied(target)
        cursor.execute(_CURRENT_STATUS, [owner_key, order_id])
        row = cursor.fetchone()
        transaction.set_rollback(True)
        return Refused(current=str(row[0]) if row else "unknown", requested=target)
