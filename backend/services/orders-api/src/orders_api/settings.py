"""Configuration from the environment (see backend/.env.example). Nothing has a production default
that would be unsafe: secrets and connection strings must be set explicitly."""

from functools import lru_cache

from pydantic import (
    AmqpDsn,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    PostgresDsn,
    RedisDsn,
    SecretStr,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class RateLimit(BaseModel):
    """A token bucket: `capacity` requests at once, refilled at `per_second`."""

    model_config = ConfigDict(frozen=True)

    capacity: int = Field(ge=1)
    per_second: float = Field(gt=0)


class Settings(BaseSettings):
    # Nested values: ORDERS_API_CLIENT_RATE_LIMIT__CAPACITY=10.
    model_config = SettingsConfigDict(
        env_prefix="ORDERS_API_", env_nested_delimiter="__", extra="ignore"
    )

    database_url: PostgresDsn
    redis_url: RedisDsn
    # RabbitMQ for background jobs. The API starts without it and answers 503 on job routes
    # until it connects; everything else keeps working.
    amqp_url: AmqpDsn
    # Separates test runs from the real queues on one broker.
    queue_prefix: str = ""
    # The Payments API (Django) and the token its /internal/ endpoints require.
    payments_url: HttpUrl
    internal_token: SecretStr = Field(min_length=16)
    payments_timeout_seconds: float = Field(default=5.0, gt=0, le=30)
    # Kafka, for the outbox relay (`orders-api-relay`); the API itself only writes the outbox.
    kafka_bootstrap: str = "localhost:9092"
    relay_poll_seconds: float = Field(default=0.25, gt=0, le=10)
    # Keys the daily-rotating hash of client IPs used by the rate limiter; raw IPs are never stored.
    ip_hash_secret: SecretStr = Field(min_length=16)
    # Website origins allowed to call the API from the browser.
    cors_origins: list[str] = Field(default_factory=list)

    sandbox_ttl_seconds: int = Field(default=1800, ge=60, le=86_400)
    trace_ttl_seconds: int = Field(default=300, ge=30, le=3600)
    product_cache_ttl_seconds: int = Field(default=30, ge=1, le=3600)
    cleanup_interval_seconds: int = Field(default=60, ge=5)

    # Per client (sandbox token or IP): the limit the playground's rate-limit scenario runs into.
    client_rate_limit: RateLimit = RateLimit(capacity=5, per_second=0.8)
    # Per IP, whatever token is sent: caps clients that rotate made-up tokens.
    ip_rate_limit: RateLimit = RateLimit(capacity=60, per_second=1.0)
    sandbox_rate_limit: RateLimit = RateLimit(capacity=5, per_second=1 / 120)
    sandbox_admin_rate_limit: RateLimit = RateLimit(capacity=20, per_second=0.5)
    trace_rate_limit: RateLimit = RateLimit(capacity=60, per_second=2.0)

    host: str = "0.0.0.0"  # noqa: S104 — the service runs in a container behind the reverse proxy
    port: int = 8000
    # Proxies whose X-Forwarded-For is trusted (the reverse proxy in front of the service).
    forwarded_allow_ips: str = "127.0.0.1"
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # values come from the environment
