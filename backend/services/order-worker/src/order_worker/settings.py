"""Configuration from the environment (`ORDER_WORKER_*`, see backend/.env.example)."""

import socket

from pydantic import AmqpDsn, Field, HttpUrl, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ORDER_WORKER_", extra="ignore")

    amqp_url: AmqpDsn
    database_url: PostgresDsn
    redis_url: RedisDsn
    # The payment provider (the local stub in compose).
    provider_url: HttpUrl
    # Kafka, for the consumer groups of orders.events.
    kafka_bootstrap: str = "localhost:9092"
    # Separates test runs from the real queues, topics and consumer groups.
    queue_prefix: str = ""

    # Jobs one worker handles at the same time (RabbitMQ prefetch).
    prefetch: int = Field(default=4, ge=1, le=100)
    provider_timeout_seconds: float = Field(default=2.0, gt=0, le=30)
    trace_ttl_seconds: int = Field(default=300, ge=30, le=3600)
    # On SIGTERM: stop taking jobs, give the running ones this long to finish.
    shutdown_grace_seconds: float = Field(default=10.0, ge=0, le=120)
    # Shows in traces and logs which replica handled an attempt (the container's hostname).
    name: str = Field(default_factory=socket.gethostname, min_length=1, max_length=64)
    log_level: str = "INFO"
