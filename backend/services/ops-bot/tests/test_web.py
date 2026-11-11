"""Telegram's webhook into the Flask app: only with the secret, only in webhook mode, and a
malformed update never makes Telegram retry."""

from __future__ import annotations

from typing import Any

import pytest
from flask.testing import FlaskClient

from ops_bot.settings import BotSettings
from ops_bot.telegram import Update
from ops_bot.web import SECRET_HEADER, WEBHOOK_PATH, create_app
from telegram_double import BOT_OWNER, BOT_TOKEN, message

SECRET = "w" * 40
OWNER = BOT_OWNER


def _settings(**overrides: Any) -> BotSettings:
    values: dict[str, Any] = {
        "telegram_token": BOT_TOKEN,
        "owner_ids": [OWNER],
        "transport": "webhook",
        "public_url": "https://runtime-city.example",
        "webhook_secret": SECRET,
        "database_url": "postgresql://u:p@localhost:5432/db",
        "redis_url": "redis://localhost:6379/0",
        "amqp_url": "amqp://u:p@localhost:5672/v",
    }
    values.update(overrides)
    return BotSettings.model_validate(values)


def _client(settings: BotSettings, received: list[Update]) -> FlaskClient:
    async def handle(update: Update) -> None:
        received.append(update)

    return create_app(settings, handle=handle).test_client()


def test_an_update_with_the_secret_reaches_the_bot() -> None:
    received: list[Update] = []
    response = _client(_settings(), received).post(
        WEBHOOK_PATH, json=message("/status", sender=OWNER), headers={SECRET_HEADER: SECRET}
    )
    assert response.status_code == 200
    [update] = received
    assert update.message is not None
    assert update.message.text == "/status"


def test_a_call_without_the_secret_is_refused() -> None:
    received: list[Update] = []
    client = _client(_settings(), received)
    update = message("/status", sender=OWNER)
    assert client.post(WEBHOOK_PATH, json=update).status_code == 403
    assert (
        client.post(WEBHOOK_PATH, json=update, headers={SECRET_HEADER: "x" * 40}).status_code == 403
    )
    assert received == []


def test_a_malformed_update_is_acknowledged_and_dropped() -> None:
    received: list[Update] = []
    response = _client(_settings(), received).post(
        WEBHOOK_PATH, data=b'{"not": "an update"}', headers={SECRET_HEADER: SECRET}
    )
    assert response.status_code == 200
    assert received == []


def test_there_is_no_webhook_while_polling() -> None:
    received: list[Update] = []
    client = _client(_settings(transport="polling"), received)
    response = client.post(
        WEBHOOK_PATH, json=message("/status", sender=OWNER), headers={SECRET_HEADER: SECRET}
    )
    assert response.status_code == 404
    assert client.get("/healthz").json == {
        "status": "ok",
        "telegram": True,
        "transport": "polling",
    }


@pytest.mark.parametrize(
    "broken", [{"public_url": "http://runtime-city.example"}, {"webhook_secret": None}]
)
def test_the_webhook_transport_needs_https_and_a_secret(broken: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="webhook transport"):
        _settings(**broken)
