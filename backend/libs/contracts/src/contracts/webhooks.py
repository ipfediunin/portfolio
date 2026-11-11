"""Payment provider webhooks: the event format and how a webhook is signed.

The provider signs `"{timestamp}.{raw body}"` with HMAC-SHA256 and the endpoint's secret and sends
`Webhook-Signature: t=<unix seconds>,v1=<hex digest>` (the scheme payment providers commonly use).
The receiver recomputes the digest over the exact bytes it got, compares in constant time and
refuses old timestamps, so a captured webhook cannot be replayed later.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SIGNATURE_HEADER = "Webhook-Signature"
# How old a signed webhook may be (seconds) before it is refused as a replay.
TOLERANCE_SECONDS = 300

Verdict = Literal["valid", "malformed", "expired", "mismatch"]


class WebhookData(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    order_id: int = Field(gt=0)


class WebhookEvent(BaseModel):
    """`payment.succeeded` / `payment.failed` for an order. `id` is the provider's event id: the
    same event may arrive more than once, and only the first one may change anything."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(pattern=r"^evt_[a-z0-9]{3,24}$")
    type: Literal["payment.succeeded", "payment.failed"]
    data: WebhookData


def _digest(secret: str, timestamp: int, body: bytes) -> str:
    message = f"{timestamp}.".encode("ascii") + body
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """The `Webhook-Signature` header value for `body` sent at `timestamp`."""
    return f"t={timestamp},v1={_digest(secret, timestamp, body)}"


def verify(secret: str, header: str | None, body: bytes, now: int) -> Verdict:
    if not header:
        return "malformed"
    parts = dict(item.split("=", 1) for item in header.split(",") if "=" in item)
    timestamp, signature = parts.get("t", ""), parts.get("v1", "")
    if not timestamp.isdigit() or len(signature) != 64:  # noqa: PLR2004 — a SHA-256 hex digest
        return "malformed"
    if abs(now - int(timestamp)) > TOLERANCE_SECONDS:
        return "expired"
    expected = _digest(secret, int(timestamp), body)
    return "valid" if hmac.compare_digest(expected, signature) else "mismatch"
