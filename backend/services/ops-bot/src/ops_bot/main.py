"""`ops-bot` command:

- `ops-bot serve` (the default) — the Flask app under gunicorn: Telegram's webhook, the healthcheck;
- `ops-bot run` — the checks and alerts, and with the polling transport the owner's commands.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import os
import signal
import sys

from ops_bot.runner import run as run_background
from ops_bot.settings import BotSettings
from telemetry import configure_logging

SERVICE_NAME = "ops-bot"


def _serve(settings: BotSettings) -> None:
    # Replaces this process (PID 1 in the container stays gunicorn, so SIGTERM reaches it).
    os.execv(  # noqa: S606 — this interpreter with fixed arguments
        sys.executable,
        [
            sys.executable,
            "-m",
            "gunicorn",
            "ops_bot.wsgi:app",
            "--bind",
            settings.bind,
            "--worker-class",
            "gthread",
            "--workers",
            "1",
            "--threads",
            "4",
            "--timeout",
            "60",
            "--graceful-timeout",
            "10",
            # The container's filesystem is read-only; the service is managed by restarting it.
            "--no-control-socket",
        ],
    )


async def _background(settings: BotSettings) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        # Not available on Windows event loops; there Ctrl+C cancels the run instead.
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(signum, stop.set)
    await run_background(settings, stop)


def run() -> None:
    parser = argparse.ArgumentParser(prog=SERVICE_NAME, description=__doc__.splitlines()[0])
    parser.add_argument("command", nargs="?", choices=("serve", "run"), default="serve")
    command = parser.parse_args().command
    settings = BotSettings()  # values come from the environment
    configure_logging(SERVICE_NAME, settings.log_level)
    if command == "serve":
        _serve(settings)
    else:
        asyncio.run(_background(settings))
