"""Configuration from the environment (`OPS_BOT_*`, see backend/.env.example).

Without a Telegram token the bot still runs: it checks the system and logs the alerts it would
send. Only the user ids in `owner_ids` may talk to it."""

from __future__ import annotations

import re
import socket
from typing import Literal

from pydantic import (
    AmqpDsn,
    Field,
    HttpUrl,
    PostgresDsn,
    RedisDsn,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

_SECRET = re.compile(r"[A-Za-z0-9_-]{32,256}")


class BotSettings(BaseSettings):
    # Lists as JSON: OPS_BOT_OWNER_IDS=[123456789].
    # An empty variable counts as unset: compose passes `OPS_BOT_TELEGRAM_TOKEN=` without .env.
    model_config = SettingsConfigDict(env_prefix="OPS_BOT_", extra="ignore", env_ignore_empty=True)

    # --- Telegram -------------------------------------------------------------------------------
    # From @BotFather. A bot of its own: not the contact form's bot.
    telegram_token: SecretStr | None = None
    # Telegram user ids of the owner; messages from anyone else are ignored without an answer.
    owner_ids: list[int] = Field(default_factory=list)
    # webhook: Telegram calls /telegram/webhook through the edge (needs the site's public HTTPS);
    # polling: the bot asks Telegram for updates itself (local development, nothing exposed).
    transport: Literal["webhook", "polling"] = "polling"
    # The site's public address; the webhook is registered at <public_url>/telegram/webhook.
    public_url: HttpUrl | None = None
    # Telegram sends it back in X-Telegram-Bot-Api-Secret-Token with every webhook call.
    webhook_secret: SecretStr | None = None
    telegram_api_url: HttpUrl = HttpUrl("https://api.telegram.org")

    # --- What the bot looks at ------------------------------------------------------------------
    # The Orders API's database (postgresql+asyncpg://…): tasks and the outbox.
    database_url: PostgresDsn
    redis_url: RedisDsn
    amqp_url: AmqpDsn
    kafka_bootstrap: str = "localhost:9092"
    # Separates test runs from the real queues, topic and consumer groups.
    queue_prefix: str = ""
    orders_api_url: HttpUrl = HttpUrl("http://orders-api:8000")
    payments_url: HttpUrl = HttpUrl("http://payments:8001")
    hub_url: HttpUrl = HttpUrl("http://realtime-hub:8200")

    # --- Alerts ---------------------------------------------------------------------------------
    check_interval_seconds: float = Field(default=30.0, ge=1, le=3600)
    # An event older than this still in the outbox means the relay or Kafka is stuck.
    outbox_stuck_seconds: float = Field(default=60.0, ge=1)
    # Events a consumer group may be behind before it is a problem.
    lag_alert: int = Field(default=100, ge=1)
    # A work queue this full (of its limit) is close to refusing jobs.
    queue_fill_alert: float = Field(default=0.8, gt=0, le=1)

    bind: str = "0.0.0.0:8300"
    name: str = Field(default_factory=socket.gethostname, min_length=1, max_length=64)
    log_level: str = "INFO"

    @field_validator("webhook_secret")
    @classmethod
    def _secret_telegram_accepts(cls, secret: SecretStr | None) -> SecretStr | None:
        # Telegram's rule for secret_token, with a length that makes it a real secret.
        if secret is not None and not _SECRET.fullmatch(secret.get_secret_value()):
            raise ValueError("OPS_BOT_WEBHOOK_SECRET: 32 to 256 of A-Z, a-z, 0-9, _ and -")
        return secret

    @model_validator(mode="after")
    def _webhook_is_complete(self) -> BotSettings:
        if self.transport == "webhook" and self.telegram_token is not None:
            if self.public_url is None or self.public_url.scheme != "https":
                raise ValueError("the webhook transport needs OPS_BOT_PUBLIC_URL over https")
            if self.webhook_secret is None:
                raise ValueError("the webhook transport needs OPS_BOT_WEBHOOK_SECRET")
        return self

    @property
    def telegram_ready(self) -> bool:
        return self.telegram_token is not None and bool(self.owner_ids)
