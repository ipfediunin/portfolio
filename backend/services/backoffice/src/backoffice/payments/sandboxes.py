"""Which sandbox a webhook belongs to, and how many it may send.

Sandboxes are created by the Orders API; this service only reads them from Redis by the SHA-256 of
the bearer token. Webhooks have their own small budget per sandbox and minute.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass

from django.conf import settings
from django.http import HttpRequest
from pydantic import ValidationError

from backoffice import deps
from contracts import SandboxRecord, client_key, sandbox_key, token_hash
from telemetry import span

_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")


@dataclass(frozen=True)
class Sandbox:
    client_key: str
    webhook_secret: str


def from_request(request: HttpRequest) -> Sandbox | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    with span("auth", "GET sandbox:<token sha256>") as check:
        check.ok = False
        if scheme.lower() != "bearer" or not _TOKEN.match(token):
            check.attributes["sandbox"] = "no token"
            return None
        hashed = token_hash(token)
        raw = deps.redis().get(sandbox_key(hashed))
        if not isinstance(raw, str):
            check.attributes["sandbox"] = "unknown or expired"
            return None
        try:
            record = SandboxRecord.model_validate_json(raw)
        except ValidationError as error:
            raise RuntimeError("A stored sandbox does not match the contract") from error
        check.ok = True
        check.attributes["sandbox"] = "valid"
    return Sandbox(client_key=client_key(hashed), webhook_secret=record.webhook_secret)


def allow_webhook(sandbox: Sandbox) -> bool:
    """A fixed window per sandbox and minute."""
    window = int(time.time() // 60)
    with span("rate_limit", "INCR webhooks:<client>:<minute>") as check:
        pipe = deps.redis().pipeline()
        pipe.incr(f"webhooks:{sandbox.client_key}:{window}")
        pipe.expire(f"webhooks:{sandbox.client_key}:{window}", 120)
        count = int(pipe.execute()[0])
        check.ok = count <= settings.WEBHOOKS_PER_MINUTE
        check.attributes["count"] = count
    return check.ok
