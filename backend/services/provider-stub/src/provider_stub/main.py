"""`provider-stub` command: runs the stand-in provider with Uvicorn."""

from __future__ import annotations

import uvicorn
from pydantic_settings import BaseSettings, SettingsConfigDict

from telemetry import configure_logging


class StubSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROVIDER_STUB_", extra="ignore")

    host: str = "0.0.0.0"  # noqa: S104 — reachable only inside the compose network
    port: int = 8100
    log_level: str = "INFO"


def run() -> None:
    settings = StubSettings()
    configure_logging("provider-stub", settings.log_level)
    uvicorn.run(
        "provider_stub.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        access_log=False,
        log_config=None,
        server_header=False,
    )
