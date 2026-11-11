"""Payments as the Payments API records them, and the provider's webhook events.

A payment's status is a state machine: `TRANSITIONS` says which status may follow which, and the
webhook applies a transition in one SQL statement that refuses any other (see `webhooks.py`), so
an invalid transition cannot happen even with concurrent deliveries.

Everything here belongs to a sandbox (`owner_key`, a hash) and expires with it.
"""

from __future__ import annotations

from django.db import models


class PaymentStatus(models.TextChoices):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


# Status → the statuses it may move to. Succeeded is final here (refunds are their own flow); a
# failed payment may still succeed when the customer retries.
TRANSITIONS: dict[str, frozenset[str]] = {
    PaymentStatus.PENDING: frozenset({PaymentStatus.SUCCEEDED, PaymentStatus.FAILED}),
    PaymentStatus.FAILED: frozenset({PaymentStatus.SUCCEEDED}),
    PaymentStatus.SUCCEEDED: frozenset(),
}


def sources_of(target: str) -> list[str]:
    """Statuses from which `target` may be reached (an event repeating the status changes nothing
    and is allowed too)."""
    allowed = {status for status, targets in TRANSITIONS.items() if target in targets}
    return sorted(allowed | {target})


class Payment(models.Model):
    owner_key = models.CharField(max_length=40)
    order_id = models.BigIntegerField()
    status = models.CharField(max_length=16, choices=PaymentStatus.choices)
    last_event_id = models.CharField(max_length=40)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "payments"
        constraints = [
            models.UniqueConstraint(fields=["owner_key", "order_id"], name="one_payment_per_order"),
            models.CheckConstraint(
                condition=models.Q(status__in=PaymentStatus.values), name="payment_status_known"
            ),
        ]

    def __str__(self) -> str:
        return f"Order {self.order_id}: {self.status}"


class WebhookEvent(models.Model):
    """One row per provider event and sandbox: the unique constraint is what makes handling a
    repeated delivery a no-op."""

    owner_key = models.CharField(max_length=40)
    event_id = models.CharField(max_length=40)
    type = models.CharField(max_length=32)
    order_id = models.BigIntegerField()
    received_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "webhook_events"
        constraints = [
            models.UniqueConstraint(fields=["owner_key", "event_id"], name="event_handled_once"),
        ]

    def __str__(self) -> str:
        return f"{self.event_id} ({self.type})"


class Task(models.Model):
    """The Orders API's background tasks, read-only: the back office shows them (failed ones are
    the dead-letter queue's records) but never writes to another service's schema."""

    id = models.UUIDField(primary_key=True)
    kind = models.CharField(max_length=16)
    owner_key = models.CharField(max_length=40)
    order_id = models.BigIntegerField(null=True)
    status = models.CharField(max_length=16)
    attempts = models.SmallIntegerField()
    result = models.JSONField(null=True)
    error = models.CharField(max_length=200, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    expires_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'orders"."tasks'
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.kind} {self.id}"
