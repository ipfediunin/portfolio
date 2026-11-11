"""Sandboxes and signed provider events for the Payments API's tests (on pytest's pythonpath, like
stack_harness)."""

from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from redis import Redis

from contracts import SIGNATURE_HEADER, SandboxRecord, client_key, sandbox_key, token_hash
from contracts.webhooks import sign

REDIS_URL = "redis://127.0.0.1:6380/15"
WEBHOOK_URL = "/webhooks/payments"


@dataclass(frozen=True)
class Sandbox:
    token: str
    secret: str

    @property
    def client_key(self) -> str:
        return client_key(token_hash(self.token))

    def headers(self, body: bytes, *, signed_at: int | None = None) -> dict[str, str]:
        """What the playground sends with a webhook: the sandbox token and the signature over the
        exact body."""
        timestamp = signed_at if signed_at is not None else int(time.time())
        return {
            "Authorization": f"Bearer {self.token}",
            SIGNATURE_HEADER: sign(self.secret, timestamp, body),
        }


def new_sandbox() -> Sandbox:
    """A sandbox as the Orders API creates it."""
    token = secrets.token_urlsafe(32)
    record = SandboxRecord(created_at=datetime.now(UTC), webhook_secret=secrets.token_urlsafe(32))
    Redis.from_url(REDIS_URL).set(sandbox_key(token_hash(token)), record.model_dump_json(), ex=600)
    return Sandbox(token=token, secret=record.webhook_secret)


def event(event_id: str = "evt_8f3a", kind: str = "payment.succeeded", order: int = 42) -> bytes:
    return json.dumps({"id": event_id, "type": kind, "data": {"order_id": order}}).encode()
