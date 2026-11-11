"""Provider webhooks against real PostgreSQL and Redis: what the playground's webhook scenario
replays — signature, idempotency and the payment state machine."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import pytest
from django.test import Client, override_settings
from redis import Redis
from sqlalchemy import Engine, text

from contracts import SIGNATURE_HEADER, Trace, trace_key
from webhook_fixtures import REDIS_URL, WEBHOOK_URL, Sandbox, event, new_sandbox

if TYPE_CHECKING:
    # The test client's response type (with `.json()`); it exists only in the type stubs.
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

pytestmark = pytest.mark.integration


def _deliver(client: Client, body: bytes, headers: dict[str, str] | None = None) -> Response:
    return client.post(
        WEBHOOK_URL, data=body, content_type="application/json", headers=headers or {}
    )


def _send(client: Client, sandbox: Sandbox, body: bytes) -> Response:
    return _deliver(client, body, sandbox.headers(body))


def _events(engine: Engine) -> int:
    with engine.connect() as connection:
        query = text("SELECT count(*) FROM backoffice.webhook_events")
        return int(connection.execute(query).scalar_one())


def test_a_signed_event_marks_the_payment_and_is_traced(
    django_client: Client, sandbox: Sandbox
) -> None:
    response = _send(django_client, sandbox, event())
    assert response.status_code == 200
    assert response.json() == {"received": True, "status": "succeeded"}
    assert "db;dur=" in response["Server-Timing"]

    raw = Redis.from_url(REDIS_URL).get(trace_key(response["X-Trace-Id"]))
    assert isinstance(raw, bytes)
    trace = Trace.model_validate_json(raw)
    kinds = [span.kind for span in trace.spans]
    assert kinds == ["auth", "rate_limit", "validate", "handle", "db", "db"]
    assert {span.service for span in trace.spans} == {"payments-api"}
    assert trace.spans[3].name == "verify HMAC-SHA256 signature"
    assert trace.spans[4].name.startswith("INSERT INTO backoffice.webhook_events")
    assert trace.spans[5].name.startswith("INSERT INTO backoffice.payments")


def test_a_repeated_event_changes_nothing(
    django_client: Client, sandbox: Sandbox, sync_engine: Engine
) -> None:
    first = _send(django_client, sandbox, event())
    again = _send(django_client, sandbox, event())
    assert first.status_code == again.status_code == 200
    assert again.json() == {"received": True, "duplicate": True}
    assert again["X-Idempotent-Replay"] == "true"
    assert _events(sync_engine) == 1


def test_each_sandbox_has_its_own_event_ids(django_client: Client, sandbox: Sandbox) -> None:
    _send(django_client, sandbox, event())
    theirs = _send(django_client, new_sandbox(), event())
    assert theirs.json() == {"received": True, "status": "succeeded"}


def test_the_state_machine_refuses_succeeded_to_failed(
    django_client: Client, sandbox: Sandbox, sync_engine: Engine
) -> None:
    _send(django_client, sandbox, event("evt_paid1"))
    refused = _send(django_client, sandbox, event("evt_fail1", "payment.failed"))
    assert refused.status_code == 409
    assert refused.json() == {
        "detail": "Payment for order 42 is succeeded; it cannot become failed"
    }
    # Refused as a whole: the event is not recorded, so a corrected delivery is still possible.
    assert _events(sync_engine) == 1


def test_a_failed_payment_may_still_succeed(django_client: Client, sandbox: Sandbox) -> None:
    first = _send(django_client, sandbox, event("evt_fail2", "payment.failed"))
    second = _send(django_client, sandbox, event("evt_paid2"))
    assert first.json() == {"received": True, "status": "failed"}
    assert second.json() == {"received": True, "status": "succeeded"}


@pytest.mark.parametrize(
    ("signature", "verdict"),
    [("t=1,v1=" + "0" * 64, "expired"), ("garbage", "malformed"), (None, "malformed")],
)
def test_an_unsigned_or_forged_event_is_refused(
    django_client: Client, sandbox: Sandbox, signature: str | None, verdict: str
) -> None:
    body = event()
    headers = sandbox.headers(body)
    if signature is None:
        del headers[SIGNATURE_HEADER]
    else:
        headers[SIGNATURE_HEADER] = signature
    response = _deliver(django_client, body, headers)
    assert response.status_code == 400
    assert response.json() == {"detail": f"Invalid webhook signature ({verdict})"}


def test_a_body_changed_after_signing_is_refused(django_client: Client, sandbox: Sandbox) -> None:
    signed_for_another_body = sandbox.headers(event())
    response = _deliver(django_client, event(kind="payment.failed"), signed_for_another_body)
    assert response.json() == {"detail": "Invalid webhook signature (mismatch)"}


def test_an_old_signature_is_refused_as_a_replay(django_client: Client, sandbox: Sandbox) -> None:
    body = event()
    stale = sandbox.headers(body, signed_at=int(time.time()) - 3600)
    response = _deliver(django_client, body, stale)
    assert response.json() == {"detail": "Invalid webhook signature (expired)"}


def test_needs_a_live_sandbox(django_client: Client) -> None:
    anonymous = _deliver(django_client, event())
    assert anonymous.status_code == 401
    assert anonymous["WWW-Authenticate"] == "Bearer"
    unknown = _deliver(django_client, event(), {"Authorization": "Bearer " + "x" * 43})
    assert unknown.status_code == 401


def test_validates_the_event_like_fastapi(django_client: Client, sandbox: Sandbox) -> None:
    response = _send(
        django_client, sandbox, b'{"id": "nope", "type": "payment.lost", "data": {"order_id": 0}}'
    )
    assert response.status_code == 422
    detail: list[dict[str, Any]] = response.json()["detail"]
    locations = [item["loc"] for item in detail]
    assert locations == [["body", "id"], ["body", "type"], ["body", "data", "order_id"]]


@override_settings(WEBHOOKS_PER_MINUTE=2)
def test_each_sandbox_has_a_webhook_budget(django_client: Client, sandbox: Sandbox) -> None:
    statuses = [
        _send(django_client, sandbox, event(f"evt_burst{index}")).status_code for index in range(3)
    ]
    assert statuses == [200, 200, 429]


def test_cors_lets_only_the_website_send_webhooks(django_client: Client) -> None:
    allowed = django_client.options(
        WEBHOOK_URL,
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,webhook-signature",
        },
    )
    assert allowed.status_code == 204
    assert allowed["Access-Control-Allow-Origin"] == "http://localhost:3000"
    assert "webhook-signature" in allowed["Access-Control-Allow-Headers"]
    foreign = django_client.options(WEBHOOK_URL, headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in foreign
