"""The conversation: the owner's commands, the answers, and the replay button.

Only the owner, in a private chat, gets an answer; anyone else is ignored without one (the bot
does not reveal that it exists). Replaying dead letters changes the system, so it takes a press
on a button under the /dlq list: the button carries a one-time nonce that expires in five minutes,
so an old message cannot replay again."""

from __future__ import annotations

import contextlib
import logging
import secrets
from collections.abc import AsyncIterator, Collection
from typing import Protocol

import httpx
from redis.asyncio import Redis

from contracts import JobKind
from ops_bot.alerts import AlertBook
from ops_bot.messages import (
    BAD,
    HELP,
    render_dead_letters,
    render_open,
    render_replay,
    render_status,
)
from ops_bot.ops import OPS_FAILURES, Ops
from ops_bot.report import DeadLetters, ReplayResult, StatusReport
from ops_bot.settings import BotSettings
from ops_bot.telegram import Button, CallbackQuery, Chat, Message, TelegramApi, Update, User
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

CONFIRM_PREFIX = "ops-bot:confirm:"
CONFIRM_TTL_S = 300


class OpsPort(Protocol):
    """What the bot asks of the system (`ops_bot.ops.Ops`; a stand-in in tests)."""

    async def status(self) -> StatusReport: ...

    async def dead_letters(self) -> DeadLetters: ...

    async def replay(self, kind: JobKind) -> ReplayResult: ...


def _job_kind(value: bytes | str | None) -> JobKind | None:
    if isinstance(value, bytes):
        value = value.decode()
    if value == "report":
        return "report"
    if value == "charge":
        return "charge"
    return None


class OpsBot:
    def __init__(
        self, telegram: TelegramApi, ops: OpsPort, redis: Redis, *, owners: Collection[int]
    ) -> None:
        self._telegram = telegram
        self._ops = ops
        self._redis = redis
        self._owners = frozenset(owners)

    def _is_owner(self, user: User | None, chat: Chat | None) -> bool:
        return (
            user is not None
            and user.id in self._owners
            and (chat is None or chat.type == "private")
        )

    async def handle(self, update: Update) -> None:
        if update.message is not None:
            await self._message(update.message)
        elif update.callback_query is not None:
            await self._button(update.callback_query)

    async def _message(self, message: Message) -> None:
        if not self._is_owner(message.sender, message.chat):
            logger.info("Ignored a message from someone who is not the owner")
            return
        words = (message.text or "").split(maxsplit=1)
        # `/status@runtime_city_bot` in a client that adds the bot's name.
        command = words[0].split("@", 1)[0].lower() if words else ""
        buttons: list[list[Button]] = []
        try:
            match command:
                case "/status":
                    text = render_status(await self._ops.status())
                case "/dlq":
                    view = await self._ops.dead_letters()
                    text = render_dead_letters(view)
                    buttons = await self._replay_buttons(view)
                case "/alerts":
                    text = render_open(await AlertBook(self._redis).open_problems())
                case _:
                    text = HELP
        except OPS_FAILURES as error:
            text = f"{BAD} Could not answer {command}: {type(error).__name__}"
        await self._telegram.send_message(message.chat.id, text, buttons)

    async def _replay_buttons(self, view: DeadLetters) -> list[list[Button]]:
        rows: list[list[Button]] = []
        for queue in view.queues:
            if not queue.messages:
                continue
            nonce = secrets.token_urlsafe(12)
            await self._redis.set(f"{CONFIRM_PREFIX}{nonce}", queue.kind, ex=CONFIRM_TTL_S)
            rows.append([(f"Replay {queue.messages} from {queue.name}", f"replay:{nonce}")])
        return rows

    async def _button(self, query: CallbackQuery) -> None:
        chat = query.message.chat if query.message is not None else None
        if chat is None or not self._is_owner(query.sender, chat):
            logger.info("Ignored a button press from someone who is not the owner")
            return
        action, _, nonce = (query.data or "").partition(":")
        if action != "replay" or not nonce:
            await self._telegram.answer_callback(query.id, "Unknown button")
            return
        kind = _job_kind(await self._redis.getdel(f"{CONFIRM_PREFIX}{nonce}"))
        if kind is None:
            await self._telegram.answer_callback(query.id, "This button has expired: send /dlq")
            return
        await self._telegram.answer_callback(query.id, "Replaying…")
        try:
            text = render_replay(await self._ops.replay(kind))
        except OPS_FAILURES as error:
            text = (
                f"{BAD} Replay failed ({type(error).__name__}). Nothing is lost: the dead "
                "letters stay in their queue."
            )
        await self._telegram.send_message(chat.id, text)


@contextlib.asynccontextmanager
async def open_bot(settings: BotSettings) -> AsyncIterator[OpsBot]:
    """A bot with its own connections, closed when the block ends."""
    token = settings.telegram_token
    if token is None:
        raise RuntimeError("OPS_BOT_TELEGRAM_TOKEN is not set")
    redis = connect_redis(str(settings.redis_url))
    try:
        async with (
            TelegramApi.http_client(
                str(settings.telegram_api_url), token.get_secret_value()
            ) as telegram_http,
            httpx.AsyncClient() as http,
        ):
            yield OpsBot(
                TelegramApi(telegram_http),
                Ops(settings, http),
                redis,
                owners=settings.owner_ids,
            )
    finally:
        await redis.aclose()
