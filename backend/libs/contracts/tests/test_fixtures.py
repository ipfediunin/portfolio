"""The recorded exchanges in fixtures/ match the trace contract (the website checks them too)."""

import json
from pathlib import Path

import pytest

from contracts import ORDER_EVENT_GROUPS, Trace

FIXTURES = sorted((Path(__file__).parents[1] / "fixtures").glob("*.json"))
LIVE_SCENARIOS = {
    "sync-read",
    "cache",
    "validation",
    "auth",
    "rate-limit",
    "async-job",
    "retry",
    "dead-letter",
    "circuit-breaker",
    "webhook",
    "fan-out",
}
JOBS = {"async-job", "retry", "dead-letter"}
EVENTS = {"fan-out"}


def test_every_live_scenario_has_a_fixture() -> None:
    assert {path.stem for path in FIXTURES} == LIVE_SCENARIOS


@pytest.mark.parametrize("path", FIXTURES, ids=lambda path: path.stem)
def test_fixture_matches_the_contract(path: Path) -> None:
    exchange = json.loads(path.read_text(encoding="utf-8"))
    trace = Trace.model_validate(exchange["trace"])
    assert exchange["scenario"] == path.stem
    assert exchange["response"]["status"] == trace.status
    assert exchange["response"]["headers"]["x-trace-id"] == trace.trace_id
    assert trace.spans, "a traced request has at least the rate-limit span"
    assert [span.start_ms for span in trace.spans] == sorted(span.start_ms for span in trace.spans)

    if path.stem not in JOBS | EVENTS:
        assert trace.background is None
        return
    # Queued work: recorded once every participant was done, on the request's clock, after it.
    assert trace.background is not None
    assert trace.background.state == "done"
    background = trace.background.spans
    starts = [span.start_ms for span in background]
    assert starts == sorted(starts)
    assert starts[0] >= trace.spans[-1].start_ms
    # Recorded with the page's socket open: the hub pushed the outcome once, after it was filed.
    [push] = [span for span in background if span.kind == "push"]
    assert push.service == "realtime-hub"
    assert push.attributes["connections"] == 1
    notify = next(span for span in background if span.kind == "notify")
    assert notify.attributes["event"] == push.attributes["event"]
    assert push.start_ms >= notify.start_ms
    if path.stem in JOBS:
        assert background[0].kind == "consume"
        assert [span.kind for span in background][-2:] == ["notify", "push"]
        assert {span.service for span in background} == {"order-worker", "realtime-hub"}
        return
    # An event: the relay publishes it, then every consumer group reads it and does its part.
    assert background[0].kind == "publish"
    assert background[0].service == "outbox-relay"
    groups = [span.attributes.get("group") for span in background if span.kind == "consume"]
    assert sorted(str(group) for group in groups) == sorted(ORDER_EVENT_GROUPS)
    assert all(
        "group" in span.attributes for span in background if span.kind not in {"publish", "push"}
    )
    assert notify.attributes["group"] == "notifications"
