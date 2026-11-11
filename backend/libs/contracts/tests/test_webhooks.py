import pytest

from contracts.webhooks import TOLERANCE_SECONDS, sign, verify

SECRET = "s" * 43
BODY = b'{"id":"evt_8f3a","type":"payment.succeeded","data":{"order_id":42}}'
NOW = 1_800_000_000


def test_a_signature_verifies_over_the_exact_body() -> None:
    header = sign(SECRET, NOW, BODY)
    assert header.startswith(f"t={NOW},v1=")
    assert verify(SECRET, header, BODY, NOW) == "valid"
    assert verify(SECRET, header, BODY + b" ", NOW) == "mismatch"
    assert verify("t" * 43, header, BODY, NOW) == "mismatch"


@pytest.mark.parametrize("age", [TOLERANCE_SECONDS + 1, -(TOLERANCE_SECONDS + 1)])
def test_old_or_future_signatures_are_refused(age: int) -> None:
    header = sign(SECRET, NOW - age, BODY)
    assert verify(SECRET, header, BODY, NOW) == "expired"


@pytest.mark.parametrize("header", [None, "", "v1=abc", "t=soon,v1=" + "0" * 64, "t=1,v1=short"])
def test_malformed_headers_are_refused(header: str | None) -> None:
    assert verify(SECRET, header, BODY, NOW) == "malformed"
