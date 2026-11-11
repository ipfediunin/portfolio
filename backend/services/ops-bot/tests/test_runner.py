"""What the background process tells Telegram when it starts: the commands, and where updates go."""

from __future__ import annotations

import asyncio
from typing import Any

from ops_bot.messages import COMMANDS
from ops_bot.runner import prepare
from ops_bot.settings import BotSettings
from telegram_double import BOT_OWNER, BOT_TOKEN, TelegramDouble

SECRET = "s" * 40


def _settings(**overrides: Any) -> BotSettings:
    values: dict[str, Any] = {
        "telegram_token": BOT_TOKEN,
        "owner_ids": [BOT_OWNER],
        "database_url": "postgresql+asyncpg://u:p@localhost:5432/db",
        "redis_url": "redis://localhost:6379/0",
        "amqp_url": "amqp://u:p@localhost:5672/v",
    }
    values.update(overrides)
    return BotSettings.model_validate(values)


async def test_the_webhook_is_registered_with_its_secret() -> None:
    telegram = TelegramDouble()
    settings = _settings(
        transport="webhook", public_url="https://runtime-city.example", webhook_secret=SECRET
    )
    assert await prepare(telegram.api(), settings, asyncio.Event())
    [commands] = telegram.sent("setMyCommands")
    assert [item["command"] for item in commands["commands"]] == [name for name, _ in COMMANDS]
    [webhook] = telegram.sent("setWebhook")
    assert webhook["url"] == "https://runtime-city.example/telegram/webhook"
    assert webhook["secret_token"] == SECRET
    assert webhook["allowed_updates"] == ["message", "callback_query"]
    assert telegram.sent("deleteWebhook") == []


async def test_polling_removes_any_webhook_first() -> None:
    telegram = TelegramDouble()
    assert await prepare(telegram.api(), _settings(transport="polling"), asyncio.Event())
    assert telegram.sent("deleteWebhook") == [{"drop_pending_updates": False}]
    assert telegram.sent("setWebhook") == []
