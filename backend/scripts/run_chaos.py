"""Chaos experiments against the compose stack; writes the report the site shows on
/architecture/report (src/content/reports/chaos.json).

    docker compose up -d --build
    uv run python scripts/run_chaos.py [--only worker-killed kafka-down ...]

Each experiment states a hypothesis about the steady state, breaks one thing for real (kills a
container, stops a broker), measures what the system does and whether it comes back by itself.
Like the load run it uses compose.load.yaml (one machine, one IP, many requests), and whatever
happens it starts the stack again with the normal limits at the end.
"""

from __future__ import annotations

import argparse
import statistics
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import psycopg
from bench_env import PROJECT, docker, environment, write_report
from redis import Redis

DATABASE = "postgresql://runtime:runtime-dev@127.0.0.1:5433/runtime_city"
REDIS = "redis://127.0.0.1:6380/0"
PAYMENT = {"order_id": 42, "amount": 129.9, "currency": "EUR"}
ORDER = {"product_id": "kb-7", "quantity": 1, "delivery": "standard"}
# "Fails fast": an answer within a second, whatever is down (the API's Redis timeout is 0.5 s).
FAIL_FAST_MS = 1000
# A burst big enough that both workers hold unacknowledged jobs when one is killed.
PAYMENTS = 100
HEALTHZ = (
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8200/healthz', timeout=2)"
)


@dataclass
class Outcome:
    passed: bool = True
    observations: list[dict[str, str]] = field(default_factory=list)

    def observe(self, label: str, value: str, *, ok: bool = True) -> None:
        self.observations.append({"label": label, "value": value})
        self.passed = self.passed and ok


@dataclass(frozen=True)
class Experiment:
    id: str
    title: str
    fault: str
    hypothesis: str
    run: Callable[[Lab], Outcome]


class Lab:
    """The stack under test: its API through the edge, its database and Redis on the host."""

    def __init__(self, host: str) -> None:
        self.api = httpx.Client(base_url=host, timeout=10)

    def close(self) -> None:
        self.api.close()

    def sandbox(self) -> dict[str, str]:
        response = self.api.post("/api/sandbox")
        response.raise_for_status()
        return {"Authorization": f"Bearer {response.json()['token']}"}

    @staticmethod
    def sql(query: str, *params: object) -> list[tuple[Any, ...]]:
        with psycopg.connect(DATABASE, connect_timeout=5) as connection:
            return connection.execute(query, params).fetchall()

    @staticmethod
    def compose(*args: str) -> None:
        docker("compose", *args, timeout=300)

    @staticmethod
    def wait_until(check: Callable[[], bool], within_s: float, every_s: float = 0.5) -> float:
        """Seconds until `check` held; raises TimeoutError after `within_s`."""
        started = time.monotonic()
        while True:
            try:
                if check():
                    return time.monotonic() - started
            except (httpx.HTTPError, psycopg.Error, OSError, subprocess.CalledProcessError):
                pass  # the part is still coming back: checked again
            if time.monotonic() - started > within_s:
                raise TimeoutError(f"not within {within_s:.0f} s")
            time.sleep(every_s)


def _seconds(value: float) -> str:
    return f"{value:.1f} s"


def worker_killed(lab: Lab) -> Outcome:
    outcome = Outcome()
    auth = lab.sandbox()
    jobs: list[tuple[str, str]] = []
    for _ in range(PAYMENTS):
        response = lab.api.post(
            "/api/orders/42/pay", json=PAYMENT, headers={**auth, "X-Fault-Fail-Attempts": "1"}
        )
        response.raise_for_status()
        jobs.append((response.json()["task_id"], response.headers["x-trace-id"]))
    tasks = [task for task, _ in jobs]
    # Both replicas are busy with the burst (each holds up to 4 unacknowledged jobs).
    docker("kill", f"{PROJECT}-order-worker-1")
    killed_at = time.monotonic()

    def finished() -> bool:
        rows = lab.sql(
            "SELECT count(*) FROM orders.tasks WHERE id = ANY(%s::uuid[]) "
            "AND status IN ('succeeded', 'failed')",
            tasks,
        )
        return int(rows[0][0]) == len(tasks)

    lab.wait_until(finished, within_s=120)
    elapsed = time.monotonic() - killed_at
    rows = lab.sql(
        "SELECT status, result->>'charge_id' FROM orders.tasks WHERE id = ANY(%s::uuid[])", tasks
    )
    succeeded = [charge for status, charge in rows if status == "succeeded"]
    outcome.observe(
        "Payments finished",
        f"{len(succeeded)} of {len(tasks)} succeeded",
        ok=len(succeeded) == len(tasks),
    )
    distinct = len(set(succeeded))
    outcome.observe(
        "Charges at the provider",
        f"{distinct} charge ids for {len(succeeded)} payments: none charged twice",
        ok=distinct == len(succeeded),
    )
    redelivered = 0
    for _, trace_id in jobs:
        trace = lab.api.get(f"/api/traces/{trace_id}").json()
        spans = (trace.get("background") or {}).get("spans") or []
        redelivered += any(span.get("attributes", {}).get("redelivered") for span in spans)
    outcome.observe(
        "Redelivered to the other worker",
        f"{redelivered} job(s) the killed worker held unacknowledged",
        ok=redelivered > 0,
    )
    outcome.observe("All done after the kill", _seconds(elapsed))
    lab.compose("start", "order-worker")
    return outcome


def kafka_down(lab: Lab) -> Outcome:
    outcome = Outcome()
    auth = lab.sandbox()
    lab.compose("stop", "kafka")
    timings, orders = [], []
    for _ in range(10):
        started = time.perf_counter()
        response = lab.api.post("/api/orders", json=ORDER, headers=auth)
        timings.append((time.perf_counter() - started) * 1000)
        if response.status_code == httpx.codes.CREATED:
            orders.append(str(response.json()["id"]))
    outcome.observe(
        "Orders accepted while Kafka was down",
        f"{len(orders)} of 10 (201), median {statistics.median(timings):.0f} ms",
        ok=len(orders) == 10,  # noqa: PLR2004
    )
    time.sleep(3)
    waiting = lab.sql(
        "SELECT count(*) FROM orders.outbox WHERE key = ANY(%s) AND published_at IS NULL", orders
    )[0][0]
    outcome.observe("Events waiting in the outbox", str(waiting), ok=int(waiting) == len(orders))
    events = [
        row[0]
        for row in lab.sql(
            "SELECT payload->>'event_id' FROM orders.outbox WHERE key = ANY(%s)", orders
        )
    ]
    lab.compose("start", "kafka")
    redis = Redis.from_url(REDIS)

    def caught_up() -> bool:
        reserved = lab.sql(
            "SELECT count(*) FROM orders.reservations WHERE order_id = ANY(%s::bigint[])", orders
        )[0][0]
        counted = lab.sql(
            "SELECT count(*) FROM orders.processed_events "
            "WHERE consumer_group = 'analytics' AND event_id = ANY(%s::uuid[])",
            events,
        )[0][0]
        notified = sum(int(redis.exists(f"notified:event:{event}")) for event in events)
        return int(reserved) == int(counted) == notified == len(orders)

    recovered = lab.wait_until(caught_up, within_s=120, every_s=1.0)
    redis.close()
    outcome.observe(
        "Every consumer group caught up after Kafka was back",
        f"{_seconds(recovered)}: {len(orders)} reserved, counted and notified",
    )
    return outcome


def rabbitmq_down(lab: Lab) -> Outcome:
    outcome = Outcome()
    auth = lab.sandbox()
    lab.compose("stop", "rabbitmq")
    refused = lab.api.post("/api/reports", json={"period": "2026-10"}, headers=auth)
    outcome.observe(
        "A new job while RabbitMQ is down",
        f"{refused.status_code}, Retry-After {refused.headers.get('retry-after', '—')} s",
        ok=refused.status_code == httpx.codes.SERVICE_UNAVAILABLE
        and "retry-after" in refused.headers,
    )
    read = lab.api.get("/api/orders/42", headers=auth)
    order = lab.api.post("/api/orders", json=ORDER, headers=auth)
    outcome.observe(
        "Everything that needs no queue",
        f"reads {read.status_code}, orders {order.status_code}",
        ok=read.status_code == httpx.codes.OK and order.status_code == httpx.codes.CREATED,
    )
    lab.compose("start", "rabbitmq")
    accepted: list[str] = []

    def accepts_jobs() -> bool:
        response = lab.api.post("/api/reports", json={"period": "2026-10"}, headers=auth)
        if response.status_code == httpx.codes.ACCEPTED:
            accepted.append(response.json()["task_id"])
            return True
        return False

    back = lab.wait_until(accepts_jobs, within_s=120, every_s=1.0)
    outcome.observe("Jobs accepted again, without a restart", f"after {_seconds(back)}")
    done = lab.wait_until(
        lambda: (
            lab.sql("SELECT status FROM orders.tasks WHERE id = %s::uuid", accepted[0])[0][0]
            == "succeeded"
        ),
        within_s=60,
    )
    outcome.observe("That job done by a reconnected worker", f"{_seconds(done)} later")
    return outcome


def redis_down(lab: Lab) -> Outcome:
    outcome = Outcome()
    auth = lab.sandbox()
    lab.compose("stop", "redis")
    started = time.perf_counter()
    response = lab.api.get("/api/products/7")
    took = (time.perf_counter() - started) * 1000
    outcome.observe(
        "A request while Redis is down",
        f"{response.status_code}, Retry-After {response.headers.get('retry-after', '—')}, "
        f"in {took:.0f} ms",
        ok=response.status_code == httpx.codes.SERVICE_UNAVAILABLE
        and "retry-after" in response.headers
        and took < FAIL_FAST_MS,
    )
    ready = lab.api.get("/readyz")
    outcome.observe(
        "Readiness",
        f"{ready.status_code}: redis {ready.json().get('checks', {}).get('redis', '?')}",
        ok=ready.status_code == httpx.codes.SERVICE_UNAVAILABLE,
    )
    lab.compose("start", "redis")
    back = lab.wait_until(
        lambda: lab.api.get("/api/products/7").status_code == httpx.codes.OK, within_s=60
    )
    outcome.observe("Serving again, without a restart", f"after {_seconds(back)}")
    # Redis keeps nothing on disk: sandboxes are gone, the page starts a new one.
    stale = lab.api.get("/api/orders/42", headers=auth)
    outcome.observe(
        "A sandbox from before the restart",
        f"{stale.status_code}: gone with Redis, as designed (nothing personal is kept)",
        ok=stale.status_code == httpx.codes.UNAUTHORIZED,
    )

    def hub_listening() -> bool:
        # Fails (non-zero exit) while the hub's /healthz answers 503.
        docker("exec", f"{PROJECT}-realtime-hub-1", "python", "-c", HEALTHZ)
        return True

    hub = lab.wait_until(hub_listening, within_s=60, every_s=1.0)
    outcome.observe("Realtime hub subscribed again", f"after {_seconds(hub)}")
    # Every service's pooled connections died with Redis: an order now needs all of them (the
    # API, the relay, three consumer groups) to reach Redis again for its trace to complete.
    fresh = lab.sandbox()
    placed = lab.api.post("/api/orders", json=ORDER, headers=fresh)
    trace_id = placed.headers["x-trace-id"]

    def trace_complete() -> bool:
        background = lab.api.get(f"/api/traces/{trace_id}").json().get("background") or {}
        return background.get("state") == "done"

    completed = lab.wait_until(trace_complete, within_s=30)
    outcome.observe(
        "An order right after the restart",
        f"its trace completed in {_seconds(completed)}: every service reconnected",
    )
    return outcome


EXPERIMENTS = (
    Experiment(
        id="worker-killed",
        title="A worker dies in the middle of payments",
        fault=f"{PAYMENTS} payments whose first provider call fails; while both order-worker "
        "replicas work through them, one is killed (SIGKILL)",
        hypothesis="No payment is lost and none is charged twice: RabbitMQ redelivers the "
        "unacknowledged jobs to the other replica, and the provider gets the task id as its "
        "idempotency key.",
        run=worker_killed,
    ),
    Experiment(
        id="kafka-down",
        title="Kafka is down while orders come in",
        fault="Kafka stopped; 10 orders created; Kafka started again",
        hypothesis="Orders are still accepted at full speed: each event waits in the outbox, in "
        "the same transaction as its order, and every consumer group catches up once Kafka is "
        "back.",
        run=kafka_down,
    ),
    Experiment(
        id="rabbitmq-down",
        title="RabbitMQ is down",
        fault="RabbitMQ stopped, then started again",
        hypothesis="Only queued work is refused, with 503 and Retry-After; reads and orders keep "
        "working; once RabbitMQ is back the API and the workers reconnect by themselves.",
        run=rabbitmq_down,
    ),
    Experiment(
        id="redis-down",
        title="Redis is down",
        fault="Redis stopped, then started again",
        hypothesis="The API fails fast and honestly (503 with Retry-After, readiness down) "
        "instead of erroring or hanging, and serves again as soon as Redis is back.",
        run=redis_down,
    ),
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="http://127.0.0.1:8000")
    parser.add_argument("--only", nargs="+", choices=[item.id for item in EXPERIMENTS])
    args = parser.parse_args()
    chosen = [item for item in EXPERIMENTS if not args.only or item.id in args.only]

    docker(
        "compose",
        "-f",
        "compose.yaml",
        "-f",
        "compose.load.yaml",
        "up",
        "-d",
        "--wait",
        timeout=600,
    )
    lab = Lab(args.host)
    results = []
    try:
        for experiment in chosen:
            print(f"{experiment.id}…", flush=True)  # noqa: T201
            try:
                outcome = experiment.run(lab)
            except (TimeoutError, httpx.HTTPError, psycopg.Error) as error:
                outcome = Outcome(passed=False)
                outcome.observe("Did not finish", f"{type(error).__name__}: {error}", ok=False)
            finally:
                # Whatever the experiment broke is started again before the next one.
                docker(
                    "compose",
                    "-f",
                    "compose.yaml",
                    "-f",
                    "compose.load.yaml",
                    "up",
                    "-d",
                    "--wait",
                    timeout=600,
                )
            results.append(
                {
                    "id": experiment.id,
                    "title": experiment.title,
                    "fault": experiment.fault,
                    "hypothesis": experiment.hypothesis,
                    "passed": outcome.passed,
                    "observations": outcome.observations,
                }
            )
            print(f"  {'passed' if outcome.passed else 'FAILED'}", flush=True)  # noqa: T201
            for item in outcome.observations:
                print(f"  {item['label']}: {item['value']}", flush=True)  # noqa: T201
    finally:
        lab.close()
        docker("compose", "-f", "compose.yaml", "up", "-d", "--wait", timeout=600)
    report = {
        "kind": "chaos",
        "measured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "environment": environment("the experiments' requests come from the same machine"),
        "experiments": results,
    }
    print(f"Wrote {write_report('chaos', report)}")  # noqa: T201


if __name__ == "__main__":
    main()
