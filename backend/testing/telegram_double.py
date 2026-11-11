"""Telegram's Bot API for the ops bot's tests: records every call, answers like Telegram does.
Nothing reaches the real Telegram."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx

from ops_bot.telegram import TelegramApi

BOT_TOKEN = "123456:test-token"
# The Telegram user id the tests' bot answers to.
BOT_OWNER = 4242


def _true(_: dict[str, Any]) -> Any:
    return True


class TelegramDouble:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        # Method → what it answers (default: `true`), e.g. updates for getUpdates.
        self.results: dict[str, Callable[[dict[str, Any]], Any]] = {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        prefix = f"/bot{BOT_TOKEN}/"
        assert request.url.path.startswith(prefix), "the token is part of the API path"
        method = request.url.path.removeprefix(prefix)
        payload: dict[str, Any] = json.loads(request.content or b"{}")
        self.calls.append((method, payload))
        answer = self.results.get(method, _true)(payload)
        return httpx.Response(200, json={"ok": True, "result": answer})

    def api(self) -> TelegramApi:
        return TelegramApi(
            httpx.AsyncClient(
                base_url=f"http://telegram.test/bot{BOT_TOKEN}/",
                transport=httpx.MockTransport(self),
            )
        )

    def sent(self, method: str = "sendMessage") -> list[dict[str, Any]]:
        return [payload for name, payload in self.calls if name == method]


def message(text: str, *, sender: int, chat_type: str = "private", update_id: int = 1) -> Any:
    """An update with a text message, as Telegram sends it."""
    return {
        "update_id": update_id,
        "message": {
            "message_id": 10,
            "chat": {"id": sender, "type": chat_type},
            "from": {"id": sender, "is_bot": False, "first_name": "Owner"},
            "date": 1793900000,
            "text": text,
        },
    }


def button_press(data: str, *, sender: int, update_id: int = 2) -> Any:
    """An update with a press on an inline button under a message of the bot."""
    return {
        "update_id": update_id,
        "callback_query": {
            "id": f"cb-{update_id}",
            "from": {"id": sender, "is_bot": False, "first_name": "Owner"},
            "message": {"message_id": 11, "chat": {"id": sender, "type": "private"}, "date": 1},
            "data": data,
        },
    }
