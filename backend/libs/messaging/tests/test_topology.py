import pytest

from messaging import RetryPolicy, Topology


def test_backoff_doubles_and_stops_after_the_last_attempt() -> None:
    policy = RetryPolicy(max_attempts=3, base_delay_ms=1000)
    assert [policy.delay_after(attempt) for attempt in (1, 2, 3)] == [1000, 2000, None]
    assert policy.delays_ms == (1000, 2000)


def test_a_single_attempt_has_no_retry_queues() -> None:
    policy = RetryPolicy(max_attempts=1)
    assert policy.delay_after(1) is None
    assert policy.delays_ms == ()


@pytest.mark.parametrize(("attempts", "delay"), [(0, 1000), (3, 0)])
def test_rejects_a_policy_that_cannot_run(attempts: int, delay: int) -> None:
    with pytest.raises(ValueError, match="at least one attempt"):
        RetryPolicy(max_attempts=attempts, base_delay_ms=delay)


def test_names_derive_from_the_prefix() -> None:
    topology = Topology(prefix="test.")
    payments = topology.queue("charge")
    assert topology.exchange == "test.jobs"
    assert payments.name == "test.jobs.payments"
    assert payments.routing_key == "payments"
    assert payments.retry_queue(2000) == "test.jobs.payments.retry.2000ms"
    assert payments.dead_letters == "test.jobs.payments.dlq"
    assert topology.queue("report").name == "test.jobs.reports"
    assert {queue.kind for queue in topology.queues} == {"report", "charge"}
