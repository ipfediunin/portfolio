from datetime import UTC, datetime

import pytest
from starlette.requests import Request

from contracts import token_hash
from orders_api.identity import bearer_token, identify, ip_hash, new_token

SECRET = b"test-secret-of-sufficient-length"


def _request(authorization: str | None = None, ip: str = "203.0.113.7") -> Request:
    headers = [(b"authorization", authorization.encode())] if authorization else []
    return Request({"type": "http", "headers": headers, "client": (ip, 51000)})


def test_new_tokens_are_random_and_match_the_expected_shape() -> None:
    first, second = new_token(), new_token()
    assert first != second
    assert bearer_token(_request(f"Bearer {first}")) == first


@pytest.mark.parametrize(
    "header",
    [None, "Basic abc", "Bearer", "Bearer short", "Bearer " + "x" * 42 + "!"],
)
def test_malformed_authorization_is_ignored(header: str | None) -> None:
    assert bearer_token(_request(header)) is None


def test_ip_hash_is_stable_within_a_day_and_changes_the_next_day() -> None:
    morning = datetime(2026, 11, 5, 8, tzinfo=UTC)
    evening = datetime(2026, 11, 5, 22, tzinfo=UTC)
    next_day = datetime(2026, 11, 6, 8, tzinfo=UTC)
    assert ip_hash("203.0.113.7", SECRET, morning) == ip_hash("203.0.113.7", SECRET, evening)
    assert ip_hash("203.0.113.7", SECRET, morning) != ip_hash("203.0.113.7", SECRET, next_day)
    assert "203" not in ip_hash("203.0.113.7", SECRET, morning)


def test_clients_are_keyed_by_token_hash_or_ip_hash() -> None:
    token = new_token()
    with_token = identify(_request(f"Bearer {token}"), SECRET)
    without = identify(_request(), SECRET)
    assert with_token.token_hash == token_hash(token)
    assert with_token.key == f"t:{token_hash(token)[:32]}"
    assert token not in with_token.key
    assert without.token_hash is None
    assert without.key == f"ip:{without.ip_key}"
    assert with_token.ip_key == without.ip_key  # the per-IP cap applies either way
