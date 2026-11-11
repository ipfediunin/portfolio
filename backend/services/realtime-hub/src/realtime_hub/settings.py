"""Configuration from the environment (`REALTIME_HUB_*`, see backend/.env.example)."""

import socket

from pydantic import Field, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class HubSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REALTIME_HUB_", extra="ignore")

    redis_url: RedisDsn
    # Website origins whose pages may open a socket (the browser sends Origin with the upgrade).
    allowed_origins: list[str] = Field(default_factory=list)
    host: str = "0.0.0.0"  # noqa: S104 — reachable only inside the compose network
    port: int = Field(default=8200, ge=1, le=65_535)

    # The page sends its token as the first message within this time, or the socket is closed.
    auth_timeout_seconds: float = Field(default=5.0, gt=0, le=60)
    # Open sockets per sandbox, across every replica (a few tabs, not a flood).
    max_connections_per_sandbox: int = Field(default=3, ge=1, le=20)
    # Traces one socket may wait for at the same time.
    max_watches: int = Field(default=20, ge=1, le=200)
    # Messages from the page per 10 seconds; more is a flood and closes the socket.
    max_client_messages: int = Field(default=40, ge=1, le=1000)
    # Messages waiting for a slow page; past this the socket is closed (the page reconnects).
    outbox_size: int = Field(default=64, ge=1, le=1000)
    # How often an open socket checks that its sandbox still exists (deleted on request).
    sandbox_check_seconds: float = Field(default=30.0, gt=0, le=600)
    trace_ttl_seconds: int = Field(default=300, ge=30, le=3600)
    # Shows in traces and logs which replica pushed (the container's hostname).
    name: str = Field(default_factory=socket.gethostname, min_length=1, max_length=64)
    log_level: str = "INFO"
