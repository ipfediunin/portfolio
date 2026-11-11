"""`realtime-hub` command: serves the pages' WebSockets with Uvicorn."""

from __future__ import annotations

import uvicorn

from realtime_hub.hub import SERVICE_NAME
from realtime_hub.settings import HubSettings
from telemetry import configure_logging

# The page sends a token or a trace id; anything bigger is not from the page.
MAX_MESSAGE_BYTES = 4096


def run() -> None:
    settings = HubSettings()  # values come from the environment
    configure_logging(SERVICE_NAME, settings.log_level)
    uvicorn.run(
        "realtime_hub.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        access_log=False,
        log_config=None,
        server_header=False,
        ws_max_size=MAX_MESSAGE_BYTES,
        # Pings keep idle sockets alive through proxies and find the dead ones.
        ws_ping_interval=20.0,
        ws_ping_timeout=20.0,
    )
