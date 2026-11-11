"""The bot's background process (`ops-bot run`): checks the system and alerts the owner; with the
polling transport it also takes the owner's commands from Telegram.

At start it tells Telegram the bot's commands and where updates go: the webhook URL (production,
behind the edge) or nowhere (polling, which is not allowed while a webhook is set)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable

import httpx
from redis.exceptions import RedisError

from ops_bot.alerts import AlertBook, find_problems
from ops_bot.bot import OpsBot, OpsPort
from ops_bot.messages import COMMANDS, render_changes
from ops_bot.ops import Ops
from ops_bot.settings import BotSettings
from ops_bot.telegram import TelegramApi, TelegramError
from ops_bot.web import WEBHOOK_PATH
from telemetry.redis_client import connect_redis

logger = logging.getLogger(__name__)

# Before Telegram is asked again after it failed.
TELEGRAM_RETRY_S = 10.0

Notify = Callable[[str], Awaitable[None]]


async def wait(stop: asyncio.Event, seconds: float) -> None:
    """Sleeps, unless asked to stop meanwhile."""
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


async def until_stopped[T](work: Awaitable[T], stop: asyncio.Event) -> T | None:
    """The result of `work`, or None when `stop` is set first (the work is cancelled)."""
    task = asyncio.ensure_future(work)
    stopping = asyncio.ensure_future(stop.wait())
    done, _ = await asyncio.wait({task, stopping}, return_when=asyncio.FIRST_COMPLETED)
    if task in done:
        stopping.cancel()
        return task.result()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    return None


async def watch(
    ops: OpsPort, book: AlertBook, settings: BotSettings, notify: Notify, stop: asyncio.Event
) -> None:
    """Checks every `check_interval_seconds`; tells the owner what is new and what cleared."""
    while not stop.is_set():
        try:
            problems = find_problems(await ops.status(), settings)
            changes = await book.diff(problems)
            if changes:
                await notify(render_changes(changes))
            await book.record(problems)
        except (RedisError, OSError, TelegramError):
            # Nothing recorded: the same changes are announced at the next check.
            logger.warning("A check could not finish", exc_info=True)
        await wait(stop, settings.check_interval_seconds)


async def poll(telegram: TelegramApi, bot: OpsBot, stop: asyncio.Event) -> None:
    """Long polling: asks Telegram for updates and hands them to the bot, one at a time."""
    offset = 0
    while not stop.is_set():
        try:
            updates = await until_stopped(telegram.get_updates(offset), stop)
        except TelegramError:
            logger.warning("Polling Telegram failed; again in %.0f s", TELEGRAM_RETRY_S)
            await wait(stop, TELEGRAM_RETRY_S)
            continue
        for update in updates or []:
            offset = update.update_id + 1
            try:
                await bot.handle(update)
            except TelegramError:
                logger.warning("Could not answer update %d", update.update_id, exc_info=True)


async def prepare(telegram: TelegramApi, settings: BotSettings, stop: asyncio.Event) -> bool:
    """Registers the commands and the transport; retries until Telegram answers. False if the
    process was told to stop first."""
    while not stop.is_set():
        try:
            await telegram.set_commands(COMMANDS)
            if settings.transport == "webhook" and settings.webhook_secret is not None:
                base = str(settings.public_url).rstrip("/")
                await telegram.set_webhook(
                    f"{base}{WEBHOOK_PATH}", settings.webhook_secret.get_secret_value()
                )
            else:
                await telegram.delete_webhook()
        except TelegramError:
            logger.warning("Telegram did not accept the setup; again in %.0f s", TELEGRAM_RETRY_S)
            await wait(stop, TELEGRAM_RETRY_S)
            continue
        logger.info("Telegram is set up for the %s transport", settings.transport)
        return True
    return False


async def run(settings: BotSettings, stop: asyncio.Event) -> None:
    redis = connect_redis(str(settings.redis_url))
    try:
        async with httpx.AsyncClient() as http:
            ops = Ops(settings, http)
            book = AlertBook(redis)
            token = settings.telegram_token
            if token is None or not settings.telegram_ready:
                logger.warning(
                    "Telegram is not configured (OPS_BOT_TELEGRAM_TOKEN, OPS_BOT_OWNER_IDS): "
                    "alerts are only logged"
                )

                async def log_alert(text: str) -> None:
                    logger.warning("Alert: %s", text)

                await watch(ops, book, settings, log_alert, stop)
                return
            async with TelegramApi.http_client(
                str(settings.telegram_api_url), token.get_secret_value()
            ) as telegram_http:
                telegram = TelegramApi(telegram_http)
                bot = OpsBot(telegram, ops, redis, owners=settings.owner_ids)
                if not await prepare(telegram, settings, stop):
                    return

                async def tell_owners(text: str) -> None:
                    for owner in settings.owner_ids:
                        # In a private chat the chat id is the user's id.
                        await telegram.send_message(owner, text)

                work = [watch(ops, book, settings, tell_owners, stop)]
                if settings.transport == "polling":
                    work.append(poll(telegram, bot, stop))
                await asyncio.gather(*work)
    finally:
        await redis.aclose()
