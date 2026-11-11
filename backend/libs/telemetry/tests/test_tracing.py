import time

import pytest

from contracts import Trace
from telemetry import RequestRecorder, SpanRecorder, current_trace, server_timing, span
from telemetry.tracing import trace_id_from


def test_continues_a_valid_w3c_trace() -> None:
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    assert trace_id_from(f"00-{trace_id}-00f067aa0ba902b7-01") == trace_id


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "garbage",
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",  # all-zero trace id
        "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",  # all-zero parent id
        "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",  # wrong shape
    ],
)
def test_starts_a_new_trace_for_invalid_headers(header: str | None) -> None:
    trace_id = trace_id_from(header)
    assert len(trace_id) == 32
    assert trace_id != "0" * 32
    assert trace_id_from(header) != trace_id  # random each time


def test_spans_are_recorded_in_order_with_outcome() -> None:
    recorder = RequestRecorder("a" * 32, "orders-api", "GET", "/api/products/7")
    token = current_trace.set(recorder)
    try:
        with span("rate_limit", "EVALSHA token_buckets") as check:
            check.attributes["remaining"] = 4
        with span("cache_get", "GET   cache:x\n  product:7") as lookup:
            lookup.attributes["hit"] = False
        with pytest.raises(RuntimeError), span("db", "SELECT 1"):
            raise RuntimeError("connection lost")
    finally:
        current_trace.reset(token)

    trace = recorder.finish(200)
    assert [item.kind for item in trace.spans] == ["rate_limit", "cache_get", "db"]
    assert trace.spans[0].attributes == {"remaining": 4}
    assert trace.spans[0].service == "orders-api"
    assert trace.spans[1].name == "GET cache:x product:7"  # whitespace collapsed
    assert trace.spans[1].ok  # a miss is not a failure
    assert not trace.spans[2].ok  # an exception is
    assert trace.duration_ms >= trace.spans[-1].start_ms
    assert trace.background is None


def test_a_request_that_queued_work_waits_for_the_background() -> None:
    recorder = RequestRecorder("c" * 32, "orders-api", "POST", "/api/reports")
    recorder.queued_background = True
    trace = recorder.finish(202)
    assert trace.background is not None
    assert trace.background.state == "pending"
    assert trace.background.spans == []


def test_a_worker_records_on_the_request_clock_and_drains_step_by_step() -> None:
    recorder = SpanRecorder("d" * 32, "order-worker", origin_ms=1500.0)
    token = current_trace.set(recorder)
    try:
        with span("consume", "consume jobs.payments attempt 1/3"):
            time.sleep(0.001)
        first = recorder.drain()
        with span("external", "POST /v1/charges"):
            pass
        second = recorder.drain()
    finally:
        current_trace.reset(token)

    assert [item.kind for item in first] == ["consume"]
    assert [item.kind for item in second] == ["external"]
    assert recorder.drain() == []
    assert first[0].start_ms >= 1500.0  # placed after the request's start, not at zero
    assert second[0].start_ms >= first[0].start_ms + first[0].duration_ms
    assert first[0].service == "order-worker"


def test_span_outside_a_trace_is_a_no_op() -> None:
    with span("db", "SELECT 1") as check:
        check.ok = False
    assert current_trace.get() is None


def test_server_timing_is_ascii_with_escaped_descriptions() -> None:
    trace = Trace.model_validate(
        {
            "trace_id": "b" * 32,
            "method": "GET",
            "path": "/api/orders/42",
            "status": 200,
            "duration_ms": 4.5,
            "spans": [
                {
                    "kind": "db",
                    "name": 'SELECT "quoted" \\ name · café',
                    "service": "orders-api",
                    "start_ms": 1.0,
                    "duration_ms": 2.25,
                    "ok": True,
                }
            ],
        }
    )
    assert server_timing(trace) == (
        'db;dur=2.250;desc="SELECT \\"quoted\\" \\\\ name  caf", total;dur=4.500'
    )
