"""The admin (sessions, CSRF, read-only views), the internal endpoint's guard, the state machine and
the expiry sweep."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import Client
from django.utils import timezone
from sqlalchemy import Engine, text

from backoffice.payments.models import Payment, PaymentStatus, WebhookEvent, sources_of
from webhook_fixtures import Sandbox, event

pytestmark = pytest.mark.integration


def test_the_state_machine_allows_only_forward_moves() -> None:
    assert sources_of(PaymentStatus.SUCCEEDED) == ["failed", "pending", "succeeded"]
    assert sources_of(PaymentStatus.FAILED) == ["failed", "pending"]


@pytest.fixture
def owner(clean_state: None) -> Iterator[User]:
    user = User.objects.create_superuser("owner-test", password="a-long-test-password-1")
    yield user
    user.delete()


def test_the_admin_needs_a_signed_in_owner(django_client: Client, owner: User) -> None:
    anonymous = django_client.get("/admin/payments/payment/")
    assert anonymous.status_code == 302
    assert anonymous["Location"].startswith("/admin/login/")

    signed_in = django_client.post(
        "/admin/login/?next=/admin/",
        {"username": "owner-test", "password": "a-long-test-password-1"},
    )
    assert signed_in.status_code == 302
    session = django_client.cookies["sessionid"]
    assert session["httponly"]
    for page in (
        "/admin/payments/payment/",
        "/admin/payments/webhookevent/",
        "/admin/payments/task/",
    ):
        assert django_client.get(page).status_code == 200, page


def test_the_admin_is_read_only(django_client: Client, owner: User, sandbox: Sandbox) -> None:
    body = event()
    django_client.post(
        "/webhooks/payments",
        data=body,
        content_type="application/json",
        headers=sandbox.headers(body),
    )
    django_client.force_login(owner)
    payment = Payment.objects.get(owner_key=sandbox.client_key)
    assert django_client.get("/admin/payments/payment/add/").status_code == 403
    assert django_client.post(f"/admin/payments/payment/{payment.pk}/delete/").status_code == 403


def test_the_internal_endpoint_needs_its_token(django_client: Client) -> None:
    url = "/internal/orders/42/payment-methods"
    assert django_client.get(url).status_code == 403
    assert django_client.get(url, headers={"X-Internal-Token": "wrong"}).status_code == 403
    malformed = django_client.get(
        url, headers={"X-Internal-Token": "integration-internal-token", "X-Client-Key": "nobody"}
    )
    assert malformed.status_code == 400


def test_expired_sandbox_data_is_swept(
    django_client: Client, sandbox: Sandbox, sync_engine: Engine
) -> None:
    body = event()
    django_client.post(
        "/webhooks/payments",
        data=body,
        content_type="application/json",
        headers=sandbox.headers(body),
    )
    past = timezone.now() - timedelta(seconds=1)
    Payment.objects.update(expires_at=past)
    WebhookEvent.objects.update(expires_at=past)
    call_command("sweep_expired")
    with sync_engine.connect() as connection:
        left = connection.execute(
            text(
                "SELECT (SELECT count(*) FROM backoffice.payments) + "
                "(SELECT count(*) FROM backoffice.webhook_events)"
            )
        ).scalar_one()
    assert left == 0
