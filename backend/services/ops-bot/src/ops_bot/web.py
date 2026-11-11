"""The Flask app (`ops-bot serve`): Telegram's webhook and the healthcheck.

Telegram calls `POST /telegram/webhook` through the edge proxy and sends the secret registered
with the webhook in `X-Telegram-Bot-Api-Secret-Token`; a call without it is refused before
anything is parsed. The update is handled within the request, which answers 200 even when the
update is malformed: an error status would only make Telegram send it again."""

from __future__ import annotations

import hmac
import logging
from collections.abc import Awaitable, Callable

from flask import Flask, abort, request
from flask.typing import ResponseReturnValue
from pydantic import ValidationError

from ops_bot.bot import open_bot
from ops_bot.settings import BotSettings
from ops_bot.telegram import TelegramError, Update

logger = logging.getLogger(__name__)

SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"  # noqa: S105 — the header's name
WEBHOOK_PATH = "/telegram/webhook"
# Telegram's updates are a few kilobytes.
MAX_UPDATE_BYTES = 256 * 1024

UpdateHandler = Callable[[Update], Awaitable[None]]


def create_app(
    settings: BotSettings | None = None, *, handle: UpdateHandler | None = None
) -> Flask:
    """`handle` replaces the bot in tests; by default every update gets a bot of its own."""
    config = settings or BotSettings()  # values come from the environment

    async def handle_with_bot(update: Update) -> None:
        async with open_bot(config) as bot:
            await bot.handle(update)

    handle_update = handle or handle_with_bot
    app = Flask("ops_bot")
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPDATE_BYTES

    @app.get("/healthz")
    def healthz() -> ResponseReturnValue:
        return {"status": "ok", "telegram": config.telegram_ready, "transport": config.transport}

    @app.post(WEBHOOK_PATH)
    async def webhook() -> ResponseReturnValue:
        secret = config.webhook_secret
        if config.transport != "webhook" or not config.telegram_ready or secret is None:
            abort(404)
        given = request.headers.get(SECRET_HEADER, "")
        if not hmac.compare_digest(given.encode(), secret.get_secret_value().encode()):
            logger.warning("Refused a webhook call without the right secret")
            abort(403)
        try:
            update = Update.model_validate_json(request.get_data())
        except ValidationError:
            logger.warning("Ignored an update of an unexpected shape")
            return "", 200
        try:
            await handle_update(update)
        except TelegramError:
            logger.warning("Could not answer update %d", update.update_id, exc_info=True)
        return "", 200

    return app
