"""The fixtures of every service's tests (one conftest for the workspace: per-service ones
would all be the module `conftest` to mypy). They share the real PostgreSQL, Redis and RabbitMQ from
compose.yaml, with a test database (`runtime_city_test`), Redis database 15 and queues prefixed
`test.` — and the Payments API's Django, configured for them. Start the stores with
`docker compose up -d postgres redis rabbitmq`.

Without them the integration tests are skipped, unless REQUIRE_INTEGRATION=1 (then they fail)."""

from __future__ import annotations

import os
import socket
from collections.abc import AsyncIterator, Iterator
from urllib.parse import urlsplit

import pytest
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError

DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://runtime:runtime-dev@127.0.0.1:5433/runtime_city_test",
)
REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6380/15")
AMQP_URL = os.environ.get("TEST_AMQP_URL", "amqp://runtime:runtime-dev@127.0.0.1:5673/runtime_city")
INTERNAL_TOKEN = "integration-internal-token"
KAFKA_BOOTSTRAP = os.environ.get("TEST_KAFKA_BOOTSTRAP", "127.0.0.1:9094")
# Test queues live next to the real ones on the same broker, under their own names.
QUEUE_PREFIX = "test."
ORIGIN = "http://localhost:3000"

# Django reads its settings once, at setup: point it at the test stores before anything imports it.
os.environ.update(
    {
        "DJANGO_SETTINGS_MODULE": "backoffice.settings",
        "BACKOFFICE_DATABASE_URL": DATABASE_URL.replace("+asyncpg", ""),
        "BACKOFFICE_REDIS_URL": REDIS_URL,
        "BACKOFFICE_SECRET_KEY": "integration-tests-only-secret-key-0123456789",
        "BACKOFFICE_INTERNAL_TOKEN": INTERNAL_TOKEN,
        "BACKOFFICE_ALLOWED_HOSTS": "testserver,payments.test,localhost",
        "BACKOFFICE_CORS_ORIGINS": ORIGIN,
        "BACKOFFICE_PROVIDER_URL": "http://provider.test",
    }
)

import django  # noqa: E402 — after the environment above

django.setup()

# Imported after Django is set up: the harness mounts the Payments API.
from django.test import Client  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from hub_harness import running_hub  # noqa: E402
from ops_bot.settings import BotSettings  # noqa: E402
from orders_api.app import create_app  # noqa: E402
from orders_api.settings import Settings  # noqa: E402
from realtime_hub.settings import HubSettings  # noqa: E402
from stack_harness import (  # noqa: E402
    Stack,
    full_stack,
    payments_provider,
    provider_double,
)
from telegram_double import BOT_OWNER, BOT_TOKEN  # noqa: E402
from webhook_fixtures import Sandbox, new_sandbox  # noqa: E402


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "+psycopg")


def unavailable(problem: str) -> None:
    if os.environ.get("REQUIRE_INTEGRATION") == "1":
        pytest.fail(problem)
    pytest.skip(problem)


def _stores_available() -> str | None:
    try:
        Redis.from_url(REDIS_URL, socket_connect_timeout=1).ping()
        with create_engine(_sync_url(DATABASE_URL), connect_args={"connect_timeout": 2}).connect():
            pass
    except (RedisError, SQLAlchemyError, OSError) as error:
        return f"PostgreSQL/Redis from compose.yaml are not reachable: {type(error).__name__}"
    return None


@pytest.fixture(scope="session")
def migrated_database() -> str:
    """The test database with both services' schemas: the Orders API's (Alembic) and the
    Payments API's (Django migrations)."""
    problem = _stores_available()
    if problem:
        unavailable(problem)
    from alembic import command  # noqa: PLC0415 — only for the integration tests
    from django.core.management import call_command  # noqa: PLC0415
    from django.db import connection  # noqa: PLC0415

    from orders_api.migrate import alembic_config  # noqa: PLC0415

    command.upgrade(alembic_config(DATABASE_URL), "head")
    with connection.cursor() as cursor:
        cursor.execute("CREATE SCHEMA IF NOT EXISTS backoffice")
    call_command("migrate", interactive=False, verbosity=0)
    return DATABASE_URL


@pytest.fixture(scope="session")
def rabbitmq() -> str:
    """The broker's URL; the test is skipped when RabbitMQ from compose.yaml is not running."""
    address = urlsplit(AMQP_URL)
    try:
        socket.create_connection((address.hostname or "", address.port or 5672), timeout=1).close()
    except OSError as error:
        unavailable(f"RabbitMQ from compose.yaml is not reachable: {type(error).__name__}")
    return AMQP_URL


@pytest.fixture(scope="session")
def kafka() -> str:
    """Kafka's bootstrap address; skipped when Kafka from compose.yaml is not running."""
    host, _, port = KAFKA_BOOTSTRAP.rpartition(":")
    try:
        socket.create_connection((host, int(port)), timeout=1).close()
    except OSError as error:
        unavailable(f"Kafka from compose.yaml is not reachable: {type(error).__name__}")
    return KAFKA_BOOTSTRAP


@pytest.fixture
def sync_engine(migrated_database: str) -> Iterator[Engine]:
    """A synchronous engine on the test database, for arranging and checking rows directly."""
    engine = create_engine(_sync_url(migrated_database))
    yield engine
    engine.dispose()


@pytest.fixture
def clean_state(migrated_database: str) -> None:
    """Every test starts with no sandbox data in either service and an empty Redis database."""
    Redis.from_url(REDIS_URL).flushdb()
    with create_engine(_sync_url(migrated_database)).begin() as connection:
        connection.execute(text("DELETE FROM orders.tasks"))
        connection.execute(text("DELETE FROM orders.outbox"))
        connection.execute(text("DELETE FROM orders.processed_events"))
        connection.execute(text("DELETE FROM orders.daily_sales"))
        connection.execute(text("DELETE FROM orders.orders WHERE owner_key IS NOT NULL"))
        connection.execute(text("DELETE FROM backoffice.webhook_events"))
        connection.execute(text("DELETE FROM backoffice.payments"))


# --- Orders API -------------------------------------------------------------------------------


@pytest.fixture
def settings(migrated_database: str) -> Settings:
    # model_validate: explicit values only, nothing read from the environment.
    return Settings.model_validate(
        {
            "database_url": migrated_database,
            "redis_url": REDIS_URL,
            "amqp_url": AMQP_URL,
            "queue_prefix": QUEUE_PREFIX,
            "kafka_bootstrap": KAFKA_BOOTSTRAP,
            "payments_url": "http://payments.test",
            "internal_token": INTERNAL_TOKEN,
            "ip_hash_secret": "integration-test-secret",
            "cors_origins": [ORIGIN],
            "cleanup_interval_seconds": 3600,
        }
    )


@pytest.fixture
def website_origin() -> str:
    return ORIGIN


@pytest.fixture
def api(settings: Settings, clean_state: None) -> Iterator[TestClient]:
    """The Orders API alone (its Payments API address does not resolve)."""
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def token(api: TestClient) -> str:
    response = api.post("/api/sandbox")
    assert response.status_code == 201
    value: str = response.json()["token"]
    return value


@pytest.fixture
async def event_stack(
    settings: Settings, rabbitmq: str, kafka: str, clean_state: None
) -> AsyncIterator[Stack]:
    """The whole stack with the outbox relay: orders' events travel through real Kafka."""
    async with full_stack(settings, rabbitmq, with_relay=True) as running:
        yield running


@pytest.fixture
async def stack(settings: Settings, rabbitmq: str, clean_state: None) -> AsyncIterator[Stack]:
    """The Orders API, the Payments API, one worker and the provider stub in this process."""
    async with full_stack(settings, rabbitmq) as running:
        yield running


# --- Ops bot ----------------------------------------------------------------------------------


@pytest.fixture
def bot_settings(migrated_database: str, clean_state: None) -> BotSettings:
    """The ops bot looking at the test stores; Telegram is a stand-in at telegram.test."""
    return BotSettings.model_validate(
        {
            "telegram_token": BOT_TOKEN,
            "owner_ids": [BOT_OWNER],
            "telegram_api_url": "http://telegram.test",
            "database_url": migrated_database,
            "redis_url": REDIS_URL,
            "amqp_url": AMQP_URL,
            "kafka_bootstrap": KAFKA_BOOTSTRAP,
            "queue_prefix": QUEUE_PREFIX,
            "check_interval_seconds": 1,
        }
    )


# --- Realtime hub ------------------------------------------------------------------------------


@pytest.fixture
def hub_settings(clean_state: None) -> HubSettings:
    # Short timeouts, so the tests of closing sockets do not wait long.
    return HubSettings.model_validate(
        {
            "redis_url": REDIS_URL,
            "allowed_origins": [ORIGIN],
            "auth_timeout_seconds": 0.5,
            "sandbox_check_seconds": 0.2,
            "name": "test-hub",
        }
    )


@pytest.fixture
async def hub(hub_settings: HubSettings) -> AsyncIterator[str]:
    """The realtime hub on a free port; yields its base URL."""
    async with running_hub(hub_settings) as url:
        yield url


# --- Payments API (Django) ----------------------------------------------------------------------


@pytest.fixture
def sandbox(clean_state: None) -> Sandbox:
    return new_sandbox()


@pytest.fixture
def django_client(clean_state: None) -> Iterator[Client]:
    """Django's test client, with the provider answering in-process."""
    with payments_provider(provider_double()):
        yield Client()
