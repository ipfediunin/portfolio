"""`backoffice-manage sweep_expired [--every SECONDS]`: deletes payments and webhook events whose
sandbox has expired. With `--every` it keeps running (the compose `payments-sweeper` service)."""

from __future__ import annotations

import logging
import time
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import DatabaseError
from django.utils import timezone

from backoffice.payments.models import Payment, WebhookEvent

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Deletes expired sandbox payments and webhook events."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--every", type=int, default=0, help="Repeat every N seconds.")

    def handle(self, *args: Any, **options: Any) -> None:
        every: int = options["every"]
        while True:
            try:
                now = timezone.now()
                payments, _ = Payment.objects.filter(expires_at__lt=now).delete()
                events, _ = WebhookEvent.objects.filter(expires_at__lt=now).delete()
                if payments or events:
                    logger.info("Deleted %d payments and %d webhook events", payments, events)
            except DatabaseError:
                if not every:
                    raise
                logger.exception("Sweeping failed; retrying on the next tick")
            if not every:
                return
            time.sleep(every)
