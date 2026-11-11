"""Runs the load profile (scripts/locustfile.py) against the compose stack and writes the report
the site shows on /architecture/report (src/content/reports/load.json).

    docker compose up -d --build
    uv run --group load python scripts/run_load.py [--users 20 60] [--duration 60]

For the run the Orders API and the Payments API are started with compose.load.yaml, which lifts
the per-visitor rate limits (one machine plays every visitor, from one IP); afterwards they are
started again with the normal limits. Each level ramps up, then is measured for `--duration`
seconds of steady load; containers are sampled with `docker stats` meanwhile.
"""

from __future__ import annotations

import argparse
import threading
import time
from datetime import UTC, datetime
from typing import Any

# Locust patches the standard library for gevent when it is imported (before requests: sorted
# imports keep it so). From then on time.sleep and threads are gevent's.
import locust
import requests
from bench_env import ContainerPeaks, docker, environment, write_report
from locust.env import Environment
from locust.stats import StatsEntry
from locustfile import Visitor

SAMPLE_EVERY_S = 3.0
# Request names grouped for the report, by what they exercise.
GROUPS = {
    "GET /api/orders/42": "read",
    "GET /api/products/7": "read",
    "POST /api/orders (422)": "read",
    "POST /api/orders": "events",
    "POST /api/reports": "jobs",
    "POST /api/orders/42/pay": "jobs",
    "GET /api/orders/42/checkout": "payments",
    "POST /webhooks/payments": "payments",
    "GET /api/traces/[id]": "traces",
}


def _compose(*files: str, services: tuple[str, ...]) -> None:
    arguments = [part for file in files for part in ("-f", file)]
    docker("compose", *arguments, "up", "-d", "--wait", *services, timeout=300)


def _ready(host: str) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            if requests.get(f"{host}/readyz", timeout=2).status_code == 200:  # noqa: PLR2004
                return
        except requests.RequestException:
            pass  # still starting: asked again below
        time.sleep(1)
    raise TimeoutError("the Orders API did not become ready")


def _percentiles(entry: StatsEntry) -> dict[str, float]:
    return {
        "p50": round(entry.get_response_time_percentile(0.5), 1),
        "p95": round(entry.get_response_time_percentile(0.95), 1),
        "p99": round(entry.get_response_time_percentile(0.99), 1),
        "max": round(entry.max_response_time, 1),
    }


def _level(host: str, users: int, spawn_rate: float, duration_s: float) -> dict[str, Any]:
    env = Environment(user_classes=[Visitor], host=host)
    runner = env.create_local_runner()
    peaks = ContainerPeaks()
    sampling = threading.Event()

    def sample() -> None:
        while not sampling.is_set():
            peaks.sample()
            sampling.wait(SAMPLE_EVERY_S)

    runner.start(users, spawn_rate=spawn_rate)
    time.sleep(users / spawn_rate + 3)  # ramp up, then let it settle
    env.stats.reset_all()
    sampler = threading.Thread(target=sample)
    sampler.start()
    started = time.monotonic()
    time.sleep(duration_s)
    elapsed = time.monotonic() - started
    endpoints: list[dict[str, Any]] = []
    background: list[dict[str, Any]] = []
    for entry in sorted(env.stats.entries.values(), key=lambda item: item.name):
        if entry.method == "ASYNC":
            background.append(
                {
                    "name": entry.name,
                    "count": entry.num_requests,
                    "failures": entry.num_failures,
                    **_percentiles(entry),
                }
            )
        elif entry.name in GROUPS:
            endpoints.append(
                {
                    "name": entry.name,
                    "group": GROUPS[entry.name],
                    "requests": entry.num_requests,
                    "failures": entry.num_failures,
                    "rps": round(entry.num_requests / elapsed, 1),
                    **_percentiles(entry),
                }
            )
    total = env.stats.total
    sampling.set()
    sampler.join()
    runner.quit()
    return {
        "users": users,
        "duration_s": round(elapsed),
        "requests": sum(item["requests"] for item in endpoints),
        "failures": sum(item["failures"] for item in endpoints),
        "rps": round(sum(item["requests"] for item in endpoints) / elapsed, 1),
        "p95": round(total.get_response_time_percentile(0.95), 1),
        "endpoints": endpoints,
        "background": background,
        "containers": peaks.report(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="http://127.0.0.1:8000")
    parser.add_argument("--users", type=int, nargs="+", default=[20, 60])
    parser.add_argument("--spawn-rate", type=float, default=10.0)
    parser.add_argument("--duration", type=float, default=60.0)
    args = parser.parse_args()

    limited = ("orders-api", "payments")
    _compose("compose.yaml", "compose.load.yaml", services=limited)
    try:
        _ready(args.host)
        runs = []
        for users in args.users:
            print(f"{users} users for {args.duration:.0f} s…", flush=True)  # noqa: T201
            runs.append(_level(args.host, users, args.spawn_rate, args.duration))
            print(  # noqa: T201
                f"  {runs[-1]['rps']} req/s, p95 {runs[-1]['p95']} ms, "
                f"{runs[-1]['failures']} failures",
                flush=True,
            )
    finally:
        _compose("compose.yaml", services=limited)  # the normal limits again
    report = {
        "kind": "load",
        "measured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "environment": environment(f"Locust {locust.__version__} on the same machine"),
        "profile": {
            "spawn_rate": args.spawn_rate,
            "wait_s": [0.2, 1.0],
            "weights": {
                "GET /api/orders/42": 4,
                "GET /api/products/7": 4,
                "POST /api/orders (422)": 1,
                "POST /api/orders": 2,
                "POST /api/reports": 1,
                "POST /api/orders/42/pay": 1,
                "GET /api/orders/42/checkout": 1,
                "POST /webhooks/payments": 1,
            },
        },
        "runs": runs,
    }
    print(f"Wrote {write_report('load', report)}")  # noqa: T201


if __name__ == "__main__":
    main()
