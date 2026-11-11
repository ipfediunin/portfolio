"""Background jobs end to end: the API queues, a real worker consumes from real RabbitMQ, the
provider stub fails on request. This is what the playground's async scenarios replay."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from aio_pika.exceptions import QueueEmpty

from contracts import JOB_ADAPTER, Trace, TraceSpan
from hub_harness import page_socket, receive
from messaging import Topology
from orders_api.settings import Settings
from stack_harness import Stack, api_only, eventually, purge

pytestmark = [pytest.mark.integration, pytest.mark.broker]

PAYMENT = {"order_id": 42, "amount": 129.9, "currency": "EUR"}


def _kinds(spans: list[TraceSpan]) -> list[str]:
    return [item.kind for item in spans]


def _background(trace: Trace) -> list[TraceSpan]:
    assert trace.background is not None
    assert trace.background.state == "done"
    return trace.background.spans


async def _pay(
    stack: Stack, failures: int, body: dict[str, object] = PAYMENT
) -> tuple[httpx.Response, dict[str, str]]:
    auth = await stack.sandbox()
    response = await stack.client.post(
        "/api/orders/42/pay", json=body, headers={**auth, "X-Fault-Fail-Attempts": str(failures)}
    )
    return response, auth


async def _task(stack: Stack, response: httpx.Response, auth: dict[str, str]) -> dict[str, object]:
    task = await stack.client.get(response.headers["location"], headers=auth)
    assert task.status_code == 200
    body: dict[str, object] = task.json()
    return body


async def test_a_report_is_built_in_the_background(stack: Stack) -> None:
    response = await stack.client.post("/api/reports", json={"period": "2026-10"})
    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert response.headers["location"] == f"/api/tasks/{response.json()['task_id']}"

    trace = await stack.finished_trace(response.headers["x-trace-id"])
    assert _kinds(trace.spans) == ["rate_limit", "validate", "handle", "db", "publish"]
    assert trace.spans[-1].name == "basic.publish test.jobs -> test.jobs.reports (confirm)"
    background = _background(trace)
    assert _kinds(background) == ["consume", "db", "db"]
    consume = background[0]
    assert consume.service == "order-worker"
    assert consume.attributes["worker"] == "test-worker"
    # Background spans sit on the request's clock, after the job was published.
    assert consume.start_ms >= trace.spans[-1].start_ms

    task = await _task(stack, response, {})
    assert task["status"] == "succeeded"
    # The shared demo orders of October 2026 (ids 38 to 41).
    assert task["result"] == {"period": "2026-10", "orders": 4, "revenue": {"EUR": 695.9}}


async def test_a_payment_is_retried_until_the_provider_recovers(stack: Stack) -> None:
    response, auth = await _pay(stack, failures=2)
    assert response.status_code == 202
    background = _background(await stack.finished_trace(response.headers["x-trace-id"]))
    # No page listens here: the outcome is filed and published, nobody gets a push.
    assert _kinds(background) == [
        *("consume", "external", "retry"),
        *("consume", "external", "retry"),
        *("consume", "external", "db", "notify"),
    ]
    calls = [item.attributes["status"] for item in background if item.kind == "external"]
    assert calls == [503, 503, 201]
    delays = [item.attributes["delay_ms"] for item in background if item.kind == "retry"]
    assert delays == [1000, 2000]
    takes = [item for item in background if item.kind == "consume"]
    assert [item.attributes["attempt"] for item in takes] == [1, 2, 3]
    # The last attempt really waited out its delay queue before it came back.
    waited = takes[2].attributes["queued_ms"]
    assert isinstance(waited, float)
    assert waited >= 1900

    task = await _task(stack, response, auth)
    assert task["status"] == "succeeded"
    assert task["attempts"] == 3
    result = task["result"]
    assert isinstance(result, dict)
    assert str(result["charge_id"]).startswith("ch_")


async def test_a_payment_that_keeps_failing_ends_in_the_dead_letter_queue(stack: Stack) -> None:
    response, auth = await _pay(stack, failures=3)
    background = _background(await stack.finished_trace(response.headers["x-trace-id"]))
    assert _kinds(background) == [
        *("consume", "external", "retry"),
        *("consume", "external", "retry"),
        *("consume", "external", "dead_letter", "db", "notify"),
    ]
    assert background[-3].name == "basic.publish test.jobs.payments.dlq (confirm)"
    assert background[-1].attributes["event"] == "payment.failed"

    task = await _task(stack, response, auth)
    assert task["status"] == "failed"
    assert task["attempts"] == 3
    assert task["error"] == "the provider answered 503"

    channel = await stack.broker.connection.channel()
    try:
        dead = await (await channel.get_queue("test.jobs.payments.dlq")).get(timeout=5)
        assert dead.headers["x-last-error"] == "the provider answered 503"
        assert str(JOB_ADAPTER.validate_json(dead.body).task_id) == task["task_id"]
        await dead.ack()
    finally:
        await channel.close()


async def test_the_page_hears_how_a_payment_ended_over_its_socket(stack: Stack) -> None:
    assert stack.hub is not None
    auth = await stack.sandbox()
    token = auth["Authorization"].removeprefix("Bearer ")
    async with page_socket(stack.hub, token) as socket:
        assert (await receive(socket))["type"] == "ready"
        response = await stack.client.post(
            "/api/orders/42/pay", json=PAYMENT, headers={**auth, "X-Fault-Fail-Attempts": "1"}
        )
        trace_id = response.headers["x-trace-id"]
        await socket.send(json.dumps({"type": "watch", "trace_id": trace_id}))
        notification = await receive(socket, 15)
        assert notification["event"] == "payment.succeeded"
        assert notification["task_id"] == response.json()["task_id"]
        assert notification["order_id"] == 42
        # The page fetches the trace once, when the hub says it is complete: no polling.
        assert await receive(socket, 15) == {"type": "trace.done", "trace_id": trace_id}
        fetched = await stack.client.get(f"/api/traces/{trace_id}")
    background = _background(Trace.model_validate(fetched.json()))
    assert _kinds(background)[-3:] == ["db", "notify", "push"]
    push = background[-1]
    assert push.service == "realtime-hub"
    assert push.attributes["connections"] == 1


async def test_payment_checks_happen_before_anything_is_queued(stack: Stack) -> None:
    mismatch, _ = await _pay(stack, 0, {**PAYMENT, "order_id": 7})
    assert mismatch.status_code == 422
    assert mismatch.json()["detail"][0]["loc"] == ["body", "order_id"]

    wrong_amount, _ = await _pay(stack, 0, {**PAYMENT, "amount": 1})
    assert wrong_amount.status_code == 422
    assert wrong_amount.json()["detail"][0]["msg"].endswith("(129.90 EUR)")
    trace = await stack.finished_trace(wrong_amount.headers["x-trace-id"])
    assert _kinds(trace.spans)[-1] == "db"
    assert trace.background is None

    unknown = await stack.client.post(
        "/api/orders/999/pay", json={**PAYMENT, "order_id": 999}, headers=await stack.sandbox()
    )
    assert unknown.status_code == 404
    assert (await stack.client.post("/api/orders/42/pay", json=PAYMENT)).status_code == 401
    too_many_failures, _ = await _pay(stack, 9)
    assert too_many_failures.status_code == 422

    channel = await stack.broker.connection.channel()
    try:
        with pytest.raises(QueueEmpty):
            await (await channel.get_queue("test.jobs.payments")).get(timeout=1)
    finally:
        await channel.close()


async def test_tasks_are_visible_only_to_their_owner(stack: Stack) -> None:
    response, _ = await _pay(stack, failures=0)
    await stack.finished_trace(response.headers["x-trace-id"])
    stranger = await stack.sandbox()
    assert (
        await stack.client.get(response.headers["location"], headers=stranger)
    ).status_code == 404


async def test_the_worker_handles_jobs_concurrently(stack: Stack) -> None:
    responses = await asyncio.gather(
        *(stack.client.post("/api/reports", json={"period": "2026-09"}) for _ in range(4))
    )
    assert [response.status_code for response in responses] == [202] * 4
    traces = await asyncio.gather(
        *(stack.finished_trace(response.headers["x-trace-id"]) for response in responses)
    )
    assert all(_kinds(_background(trace)) == ["consume", "db", "db"] for trace in traces)


async def test_ready_with_every_dependency(stack: Stack) -> None:
    ready = await stack.client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json()["checks"] == {"redis": "ok", "postgres": "ok", "rabbitmq": "ok"}


async def test_a_full_queue_refuses_jobs_with_503(
    settings: Settings, rabbitmq: str, clean_state: None
) -> None:
    # Work queues limited to one job, and no worker. A quorum queue refuses publishes once it is
    # over its limit (in-flight messages may take it a little past it), then refuses every one.
    tiny = Topology(prefix="test.backpressure.", max_queued=1)
    async with api_only(settings, tiny) as stack:
        await eventually(lambda: stack.broker.ready)
        await purge(stack.broker)
        try:
            responses = [
                await stack.client.post("/api/reports", json={"period": "2026-10"})
                for _ in range(4)
            ]
            statuses = [response.status_code for response in responses]
            assert statuses[0] == 202
            assert 503 in statuses
            first_refusal = statuses.index(503)
            assert statuses[first_refusal:] == [503] * (len(statuses) - first_refusal)

            refused = responses[first_refusal]
            assert refused.json() == {"detail": "The job queue is full, try again later"}
            assert refused.headers["retry-after"] == "5"
            trace = await stack.finished_trace(refused.headers["x-trace-id"])
            assert _kinds(trace.spans)[-2:] == ["publish", "db"]  # refused, task marked rejected
            assert not trace.spans[-2].ok
            assert trace.background is None
        finally:
            await purge(stack.broker)


async def test_without_the_broker_job_routes_answer_503_and_the_rest_works(
    settings: Settings, clean_state: None
) -> None:
    offline = settings.model_copy(update={"amqp_url": "amqp://runtime:x@127.0.0.1:1/none"})
    async with api_only(offline) as stack:
        queued = await stack.client.post("/api/reports", json={"period": "2026-10"})
        assert queued.status_code == 503
        assert queued.json() == {"detail": "The job queue is unavailable, try again later"}
        assert (await stack.client.get("/api/products/7")).status_code == 200
        ready = await stack.client.get("/readyz")
        assert ready.status_code == 503
        assert ready.json()["checks"]["rabbitmq"] == "unavailable: not connected"
