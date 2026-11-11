"""The owner's back office. Read-only: payments change through webhooks, tasks belong to the
Orders API. The admin is served on 127.0.0.1 only and needs a superuser
(`backoffice-manage createsuperuser`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib import admin
from django.db.models import Model
from django.http import HttpRequest

from backoffice.payments.models import Payment, Task, WebhookEvent

# ModelAdmin is generic only in the type stubs; at runtime it cannot be subscripted.
if TYPE_CHECKING:
    _ModelAdmin = admin.ModelAdmin[Model]
else:
    _ModelAdmin = admin.ModelAdmin


class ReadOnlyAdmin(_ModelAdmin):
    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        return False


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdmin):
    list_display = ("order_id", "status", "last_event_id", "owner_key", "updated_at", "expires_at")
    list_filter = ("status",)
    search_fields = ("order_id", "last_event_id")
    ordering = ("-updated_at",)


@admin.register(WebhookEvent)
class WebhookEventAdmin(ReadOnlyAdmin):
    list_display = ("event_id", "type", "order_id", "owner_key", "received_at")
    list_filter = ("type",)
    search_fields = ("event_id",)
    ordering = ("-received_at",)


@admin.register(Task)
class TaskAdmin(ReadOnlyAdmin):
    """Failed tasks are the jobs that ended in the dead-letter queue."""

    list_display = ("id", "kind", "status", "attempts", "error", "created_at")
    list_filter = ("status", "kind")
    search_fields = ("id",)
