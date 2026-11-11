"""The worker's provider client: how answers become outcomes (charge id, retry, dead letter)."""

import time
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from contracts import ChargeJob
from order_worker.failures import PermanentFailure, TransientFailure
from order_worker.handlers import month_bounds
from order_worker.provider import ProviderClient
from telemetry import SpanRecorder, current_trace

JOB = ChargeJob(
    task_id=uuid4(),
    trace_id="e" * 32,
    trace_started_at=time.time(),
    enqueued_at=time.time(),
    owner_key="t:abc",
    order_id=42,
    amount_cents=12990,
    currency="EUR",
    fail_attempts=2,
)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> ProviderClient:
    return ProviderClient(
        httpx.AsyncClient(base_url="http://provider.test", transport=httpx.MockTransport(handler))
    )


async def _charge(client: ProviderClient) -> tuple[str | None, SpanRecorder, Exception | None]:
    recorder = SpanRecorder(JOB.trace_id, "order-worker")
    token = current_trace.set(recorder)
    try:
        return await client.charge(JOB), recorder, None
    except (TransientFailure, PermanentFailure) as failure:
        return None, recorder, failure
    finally:
        current_trace.reset(token)


async def test_sends_the_task_id_as_idempotency_key_and_returns_the_charge() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201, json={"id": "ch_1", "status": "succeeded"})

    charge_id, recorder, failure = await _charge(_client(handler))
    assert (charge_id, failure) == ("ch_1", None)
    assert seen[0].headers["idempotency-key"] == str(JOB.task_id)
    assert seen[0].headers["x-fault-fail-attempts"] == "2"
    [call] = recorder.spans
    assert (call.kind, call.name, call.ok) == ("external", "POST /v1/charges", True)
    assert call.attributes["status"] == 201


@pytest.mark.parametrize(
    ("answer", "outcome"),
    [
        (httpx.Response(503, json={"detail": "down"}), TransientFailure),
        (httpx.Response(429, json={"detail": "slow down"}), TransientFailure),
        (httpx.Response(409, json={"detail": "key reused"}), PermanentFailure),
        (httpx.Response(201, text="not json"), PermanentFailure),
    ],
)
async def test_classifies_failed_answers(answer: httpx.Response, outcome: type[Exception]) -> None:
    _, recorder, failure = await _charge(_client(lambda _: answer))
    assert isinstance(failure, outcome)
    [call] = recorder.spans
    assert not call.ok
    assert call.attributes["status"] == answer.status_code


async def test_a_timeout_is_worth_retrying() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("no answer", request=request)

    _, recorder, failure = await _charge(_client(handler))
    assert isinstance(failure, TransientFailure)
    assert recorder.spans[0].attributes["error"] == "timeout"


async def test_marks_a_replayed_charge() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"id": "ch_1", "status": "succeeded"}, headers={"Idempotent-Replayed": "true"}
        )

    _, recorder, _ = await _charge(_client(handler))
    assert recorder.spans[0].attributes["replayed"] is True


@pytest.mark.parametrize(
    ("period", "start", "end"),
    [
        ("2026-10", datetime(2026, 10, 1, tzinfo=UTC), datetime(2026, 11, 1, tzinfo=UTC)),
        ("2026-12", datetime(2026, 12, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC)),
    ],
)
def test_a_period_is_a_calendar_month(period: str, start: datetime, end: datetime) -> None:
    assert month_bounds(period) == (start, end)
