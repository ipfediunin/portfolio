"""Commands of the service:

- `backoffice` — serves the WSGI app with gunicorn (threads: the views wait on the provider);
- `backoffice-migrate` — creates the `backoffice` schema and applies the Django migrations;
- `backoffice-manage` — Django's manage.py (createsuperuser, sweep_expired, …).
"""

from __future__ import annotations

import os
import sys


def _use_settings() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backoffice.settings")


def manage() -> None:
    _use_settings()
    from django.core.management import execute_from_command_line  # noqa: PLC0415 — settings first

    execute_from_command_line(sys.argv)


def migrate() -> None:
    _use_settings()
    import django  # noqa: PLC0415
    from django.conf import settings  # noqa: PLC0415
    from django.core.management import call_command  # noqa: PLC0415
    from django.db import connection  # noqa: PLC0415

    from telemetry import configure_logging  # noqa: PLC0415

    django.setup()
    configure_logging("payments-api-migrate", settings.LOG_LEVEL)
    with connection.cursor() as cursor:
        cursor.execute("CREATE SCHEMA IF NOT EXISTS backoffice")
    call_command("migrate", interactive=False, verbosity=1)


def serve() -> None:
    bind = os.environ.get("BACKOFFICE_BIND", "0.0.0.0:8001")
    workers = os.environ.get("BACKOFFICE_WORKERS", "2")
    # Replaces this process (PID 1 in the container stays gunicorn, so SIGTERM reaches it).
    os.execv(  # noqa: S606 — this interpreter with fixed arguments
        sys.executable,
        [
            sys.executable,
            "-m",
            "gunicorn",
            "backoffice.wsgi:application",
            "--bind",
            bind,
            "--worker-class",
            "gthread",
            "--workers",
            workers,
            "--threads",
            "4",
            "--timeout",
            "30",
            "--graceful-timeout",
            "10",
            # No runtime control socket: the container's filesystem is read-only, and the service
            # is managed by restarting it, not through `gunicornc`.
            "--no-control-socket",
        ],
    )
