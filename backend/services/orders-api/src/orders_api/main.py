"""`orders-api` command: runs the service with Uvicorn."""

from __future__ import annotations

import uvicorn

from orders_api.settings import get_settings
from orders_api.trace_middleware import SERVICE_NAME
from telemetry import configure_logging


def run() -> None:
    settings = get_settings()
    configure_logging(SERVICE_NAME, settings.log_level)
    uvicorn.run(
        "orders_api.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        proxy_headers=True,
        forwarded_allow_ips=settings.forwarded_allow_ips,
        access_log=False,
        log_config=None,
        server_header=False,
    )
