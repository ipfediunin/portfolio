"""The conversation with the bot, through a stand-in Telegram: who gets answers, what they say,
and the replay button that works once."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

import pytest
from redis.asyncio import Redis

from ops_bot.bot import OpsBot
from ops_bot.report import ServiceHealth
from ops_bot.runner import poll
from ops_bot.settings import BotSettings
from ops_bot.telegram import Update
from ops_fixtures import HEALTHY, FakeOps
from telegram_double import BOT_OWNER, TelegramDouble, button_press, message

pytestmark = pytest.mark.integration  # the replay button's nonce lives in Redis

STRANGER = 777


@pytest.fixture
async def redis(bot_settings: BotSettings) -> AsyncIterator[Redis]:
    client = Redis.from_url(str(bot_settings.redis_url), decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
def telegram() -> TelegramDouble:
    return TelegramDouble()


@pytest.fixture
def ops() -> FakeOps:
    return FakeOps()


@pytest.fixture
def bot(telegram: TelegramDouble, ops: FakeOps, redis: Redis) -> OpsBot:
    return OpsBot(telegram.api(), ops, redis, owners=[BOT_OWNER])


async def _send(bot: OpsBot, update: object) -> None:
    await bot.handle(Update.model_validate(update))


async def test_the_owner_gets_the_status(bot: OpsBot, telegram: TelegramDouble) -> None:
    await _send(bot, message("/status", sender=BOT_OWNER))
    [answer] = telegram.sent()
    assert answer["chat_id"] == BOT_OWNER
    assert answer["parse_mode"] == "HTML"
    text = answer["text"]
    assert "<b>Runtime City · status</b>" in text
    assert "✅ Orders API — ready" in text
    assert "✅ Realtime hub — 1 open socket" in text
    assert "<code>jobs.payments.dlq</code> — 2 dead letter(s)" in text
    assert "Lag — inventory 0 · analytics 0 · notifications 0" in text


async def test_strangers_and_groups_get_no_answer(bot: OpsBot, telegram: TelegramDouble) -> None:
    await _send(bot, message("/status", sender=STRANGER))
    await _send(bot, message("/status", sender=BOT_OWNER, chat_type="group"))
    await _send(bot, button_press("replay:anything", sender=STRANGER))
    assert telegram.calls == []


async def test_anything_else_gets_the_help(bot: OpsBot, telegram: TelegramDouble) -> None:
    await _send(bot, message("hello", sender=BOT_OWNER))
    await _send(bot, message("/status@runtime_city_bot", sender=BOT_OWNER, update_id=2))
    help_text, status = (payload["text"] for payload in telegram.sent())
    assert "/dlq" in help_text
    assert "Runtime City · status" in status


async def test_a_replay_takes_a_press_on_its_button_and_works_once(
    bot: OpsBot, telegram: TelegramDouble, ops: FakeOps
) -> None:
    await _send(bot, message("/dlq", sender=BOT_OWNER))
    [listing] = telegram.sent()
    assert "(fault injection)" in listing["text"]
    [[button]] = listing["reply_markup"]["inline_keyboard"]
    assert button["text"] == "Replay 2 from jobs.payments.dlq"
    assert ops.replayed == []  # listing changes nothing

    await _send(bot, button_press(button["callback_data"], sender=BOT_OWNER))
    assert ops.replayed == ["charge"]
    assert telegram.sent("answerCallbackQuery")[-1]["text"] == "Replaying…"
    assert telegram.sent()[-1]["text"] == "Replayed 2 from <code>jobs.payments.dlq</code>."

    # The same button again (an old message): nothing happens.
    await _send(bot, button_press(button["callback_data"], sender=BOT_OWNER, update_id=3))
    assert ops.replayed == ["charge"]
    assert "expired" in telegram.sent("answerCallbackQuery")[-1]["text"]


async def test_a_failed_replay_says_nothing_is_lost(
    bot: OpsBot, telegram: TelegramDouble, ops: FakeOps
) -> None:
    ops.replay_error = TimeoutError()
    await _send(bot, message("/dlq", sender=BOT_OWNER))
    [[button]] = telegram.sent()[0]["reply_markup"]["inline_keyboard"]
    await _send(bot, button_press(button["callback_data"], sender=BOT_OWNER))
    assert telegram.sent()[-1]["text"].startswith("⚠️ Replay failed (TimeoutError). Nothing is lost")


async def test_values_from_the_system_are_escaped(
    bot: OpsBot, telegram: TelegramDouble, ops: FakeOps
) -> None:
    ops.report = replace(
        HEALTHY, services=(ServiceHealth("Orders API", ok=False, detail="<b>x</b>"),)
    )
    await _send(bot, message("/status", sender=BOT_OWNER))
    assert "&lt;b&gt;x&lt;/b&gt;" in telegram.sent()[0]["text"]


async def test_polling_hands_updates_to_the_bot_and_moves_on(
    bot: OpsBot, telegram: TelegramDouble
) -> None:
    stop = asyncio.Event()
    batches = [[message("/status", sender=BOT_OWNER, update_id=7)], []]
    offsets: list[int] = []

    def updates(payload: dict[str, Any]) -> Any:
        offsets.append(payload["offset"])
        batch = batches.pop(0)
        if not batches:
            stop.set()
        return batch

    telegram.results["getUpdates"] = updates
    await asyncio.wait_for(poll(telegram.api(), bot, stop), timeout=5)
    # The next request asks only for updates after the one handled.
    assert offsets == [0, 8]
    assert "Runtime City · status" in telegram.sent()[0]["text"]
