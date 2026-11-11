"""The part of the Telegram Bot API the bot uses: the updates it receives (validated, unknown
fields ignored) and a small async client.

The token is part of every request path. The client never logs URLs, and telemetry keeps httpx's
own request log off, so the token does not end up in the logs."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

# Telegram cuts messages longer than this.
MAX_TEXT = 4096
# Long polling: Telegram holds the request this long when there is nothing new.
POLL_TIMEOUT_S = 25


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore", populate_by_name=True)


class User(_Model):
    id: int
    is_bot: bool = False


class Chat(_Model):
    id: int
    type: str


class Message(_Model):
    message_id: int
    chat: Chat
    sender: User | None = Field(default=None, alias="from")
    text: str | None = None


class CallbackQuery(_Model):
    id: str
    sender: User = Field(alias="from")
    message: Message | None = None
    data: str | None = None


class Update(_Model):
    update_id: int
    message: Message | None = None
    callback_query: CallbackQuery | None = None


class _Answer(_Model):
    ok: bool
    result: Any = None
    description: str | None = None


# (label, callback data); Telegram allows at most 64 bytes of callback data.
Button = tuple[str, str]


class TelegramError(Exception):
    """Telegram refused a call, or did not answer."""


def _keyboard(rows: Sequence[Sequence[Button]]) -> dict[str, object]:
    return {
        "inline_keyboard": [
            [{"text": label, "callback_data": data} for label, data in row] for row in rows
        ]
    }


class TelegramApi:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    @staticmethod
    def http_client(api_url: str, token: str) -> httpx.AsyncClient:
        # Long polling holds a request for POLL_TIMEOUT_S; the client waits a little longer.
        return httpx.AsyncClient(
            base_url=f"{api_url.rstrip('/')}/bot{token}/", timeout=POLL_TIMEOUT_S + 10
        )

    async def call(self, method: str, payload: dict[str, object]) -> Any:
        try:
            response = await self._http.post(method, json=payload)
        except httpx.HTTPError as error:
            raise TelegramError(f"{method}: {type(error).__name__}") from error
        try:
            answer = _Answer.model_validate_json(response.content)
        except ValidationError as error:
            raise TelegramError(
                f"{method}: HTTP {response.status_code}, not the Bot API"
            ) from error
        if not answer.ok:
            raise TelegramError(f"{method}: {answer.description or response.status_code}")
        return answer.result

    async def send_message(
        self, chat_id: int, text: str, buttons: Sequence[Sequence[Button]] = ()
    ) -> None:
        payload: dict[str, object] = {
            "chat_id": chat_id,
            "text": text[:MAX_TEXT],
            "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": True},
        }
        if buttons:
            payload["reply_markup"] = _keyboard(buttons)
        await self.call("sendMessage", payload)

    async def edit_message(
        self, chat_id: int, message_id: int, text: str, buttons: Sequence[Sequence[Button]] = ()
    ) -> None:
        await self.call(
            "editMessageText",
            {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text[:MAX_TEXT],
                "parse_mode": "HTML",
                "reply_markup": _keyboard(buttons),
            },
        )

    async def answer_callback(self, callback_id: str, text: str | None = None) -> None:
        payload: dict[str, object] = {"callback_query_id": callback_id}
        if text:
            payload["text"] = text
        await self.call("answerCallbackQuery", payload)

    async def get_updates(self, offset: int) -> list[Update]:
        result = await self.call(
            "getUpdates",
            {
                "offset": offset,
                "timeout": POLL_TIMEOUT_S,
                "allowed_updates": ["message", "callback_query"],
            },
        )
        updates: list[Update] = []
        for item in result if isinstance(result, list) else []:
            try:
                updates.append(Update.model_validate(item))
            except ValidationError:
                logger.warning("Skipping an update of an unexpected shape")
        return updates

    async def set_webhook(self, url: str, secret: str) -> None:
        await self.call(
            "setWebhook",
            {
                "url": url,
                "secret_token": secret,
                "allowed_updates": ["message", "callback_query"],
                "max_connections": 5,
            },
        )

    async def delete_webhook(self) -> None:
        await self.call("deleteWebhook", {"drop_pending_updates": False})

    async def set_commands(self, commands: Sequence[tuple[str, str]]) -> None:
        await self.call(
            "setMyCommands",
            {"commands": [{"command": name, "description": text} for name, text in commands]},
        )
