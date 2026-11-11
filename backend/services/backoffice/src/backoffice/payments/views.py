"""The Payments API's HTTP endpoints.

- `POST /webhooks/payments` — public (through the edge proxy): the provider reports a payment.
  Sandbox token, a per-sandbox budget, schema validation, the HMAC signature, then the event is
  applied at most once and only along the payment state machine.
- `GET /internal/orders/{id}/payment-methods` — for the Orders API only (shared token): asks the
  provider behind a circuit breaker; while the breaker is open it fails fast.
"""

from __future__ import annotations

import hmac
import re
import time
from typing import Any

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from pydantic import ValidationError

from backoffice import deps
from backoffice.payments import sandboxes, webhooks
from backoffice.payments.breaker import COOLDOWN_MS, CircuitBreaker
from backoffice.payments.provider import ProviderUnavailable
from contracts import SIGNATURE_HEADER, WebhookEvent
from contracts.webhooks import verify
from telemetry import span

MAX_BODY_BYTES = 4096
_CLIENT_KEY = re.compile(r"^(t|ip):[0-9a-f]{32}$")


def _problem(status: int, detail: Any, headers: dict[str, str] | None = None) -> JsonResponse:
    return JsonResponse({"detail": detail}, status=status, headers=headers)


def _validated(raw: bytes) -> WebhookEvent | JsonResponse:
    """The event, or FastAPI's 422 format (the playground shows both services alike)."""
    with span("validate", "WebhookEvent.model_validate_json") as check:
        if len(raw) > MAX_BODY_BYTES:
            check.ok = False
            return _problem(
                422,
                [
                    {
                        "type": "too_long",
                        "loc": ["body"],
                        "msg": f"Body should be at most {MAX_BODY_BYTES} bytes",
                    }
                ],
            )
        try:
            return WebhookEvent.model_validate_json(raw)
        except ValidationError as error:
            check.ok = False
            check.attributes["errors"] = error.error_count()
            return _problem(
                422,
                [
                    {
                        "type": item["type"],
                        "loc": ["body", *item["loc"]],
                        "msg": item["msg"],
                    }
                    for item in error.errors(include_url=False)
                ],
            )


def _admitted(request: HttpRequest) -> sandboxes.Sandbox | JsonResponse:
    """The sandbox the webhook is for, if it exists and has budget left."""
    sandbox = sandboxes.from_request(request)
    if sandbox is None:
        return _problem(401, "Not authenticated", {"WWW-Authenticate": "Bearer"})
    if not sandboxes.allow_webhook(sandbox):
        return _problem(429, "Too Many Requests", {"Retry-After": "60"})
    return sandbox


@csrf_exempt  # a server-to-server endpoint: authenticated by token and signature, not cookies
@require_POST
def payment_webhook(request: HttpRequest) -> JsonResponse:
    sandbox = _admitted(request)
    if isinstance(sandbox, JsonResponse):
        return sandbox

    raw = request.body
    event = _validated(raw)
    if isinstance(event, JsonResponse):
        return event

    with span("handle", "verify HMAC-SHA256 signature") as check:
        verdict = verify(
            sandbox.webhook_secret, request.headers.get(SIGNATURE_HEADER), raw, int(time.time())
        )
        check.ok = verdict == "valid"
        check.attributes["verdict"] = verdict
    if verdict != "valid":
        return _problem(400, f"Invalid webhook signature ({verdict})")

    match webhooks.apply(sandbox.client_key, event, settings.SANDBOX_TTL_SECONDS):
        case webhooks.Duplicate():
            return JsonResponse(
                {"received": True, "duplicate": True}, headers={"X-Idempotent-Replay": "true"}
            )
        case webhooks.Refused(current=current, requested=requested):
            return _problem(
                409,
                f"Payment for order {event.data.order_id} is {current}; it cannot become "
                f"{requested}",
            )
        case webhooks.Applied(status=status):
            return JsonResponse({"received": True, "status": status})


def _internal(request: HttpRequest) -> bool:
    token = settings.INTERNAL_TOKEN
    sent = request.headers.get("X-Internal-Token", "")
    return bool(token) and hmac.compare_digest(sent.encode(), token.encode())


@require_GET
def payment_methods(request: HttpRequest, order_id: int) -> JsonResponse:
    if not _internal(request):
        return _problem(403, "Forbidden")
    scope = request.headers.get("X-Client-Key", "")
    if not _CLIENT_KEY.match(scope):
        return _problem(400, "X-Client-Key is missing or malformed")
    provider_down = request.headers.get("X-Fault-Provider-Down", "").lower() == "true"

    breaker = CircuitBreaker(deps.redis(), scope)
    if breaker.acquire().state == "open":
        return _problem(
            503,
            "Payment provider is unavailable, try again later",
            {"Retry-After": str(COOLDOWN_MS // 1000)},
        )
    try:
        methods = deps.provider().payment_methods(provider_down=provider_down)
    except ProviderUnavailable as error:
        breaker.record(succeeded=False)
        return _problem(504, f"Payment provider failed: {error}")
    breaker.record(succeeded=True)
    return JsonResponse({"order_id": order_id, "payment_methods": methods})


def liveness(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})
