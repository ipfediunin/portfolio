from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from provider_stub.app import IdempotencyStore, create_app

BODY = {"amount_cents": 12990, "currency": "EUR", "reference": "42"}


@pytest.fixture
def provider() -> Iterator[TestClient]:
    with TestClient(create_app()) as client:
        yield client


def _charge(
    provider: TestClient, key: str, fail: int = 0, body: dict[str, object] = BODY
) -> httpx.Response:
    response: httpx.Response = provider.post(
        "/v1/charges",
        json=body,
        headers={"Idempotency-Key": key, "X-Fault-Fail-Attempts": str(fail)},
    )
    return response


def test_charges_once_and_replays_the_same_charge_for_the_same_key(provider: TestClient) -> None:
    first = _charge(provider, "task-0001")
    again = _charge(provider, "task-0001")
    assert first.status_code == 201
    assert again.status_code == 200
    assert again.headers["idempotent-replayed"] == "true"
    assert again.json() == first.json()
    assert first.json()["id"].startswith("ch_")


def test_fails_the_injected_number_of_calls_then_succeeds(provider: TestClient) -> None:
    statuses = [_charge(provider, "task-0002", fail=2).status_code for _ in range(4)]
    assert statuses == [503, 503, 201, 200]


def test_an_outage_answers_503_with_retry_after(provider: TestClient) -> None:
    response = _charge(provider, "task-0003", fail=1)
    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"


def test_refuses_a_key_reused_with_another_body(provider: TestClient) -> None:
    assert _charge(provider, "task-0004").status_code == 201
    other = {**BODY, "amount_cents": 1}
    assert _charge(provider, "task-0004", body=other).status_code == 409


@pytest.mark.parametrize(
    "headers",
    [
        {},  # no idempotency key
        {"Idempotency-Key": "short"},
        {"Idempotency-Key": "task-0005", "X-Fault-Fail-Attempts": "9"},
    ],
)
def test_validates_the_headers(provider: TestClient, headers: dict[str, str]) -> None:
    assert provider.post("/v1/charges", json=BODY, headers=headers).status_code == 422


def test_forgets_keys_beyond_its_capacity() -> None:
    with TestClient(create_app(IdempotencyStore(capacity=2))) as small:
        for key in ("key-00001", "key-00002", "key-00003"):
            assert _charge(small, key).status_code == 201
        # The oldest key was evicted: the provider no longer knows the earlier charge.
        assert _charge(small, "key-00001").status_code == 201
        assert _charge(small, "key-00003").status_code == 200
