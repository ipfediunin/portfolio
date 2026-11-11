"""What the bot says, as Telegram HTML. Pure functions of the reports; every value from the system
is escaped."""

from __future__ import annotations

from collections.abc import Mapping
from html import escape

from ops_bot.alerts import Changes
from ops_bot.report import (
    DeadLetters,
    FailedTask,
    QueueState,
    ReplayResult,
    StatusReport,
    describe_age,
)

COMMANDS = (
    ("status", "Services, queues, outbox and consumer lag"),
    ("dlq", "Dead letters, with a button to replay them"),
    ("alerts", "Problems that are open right now"),
    ("help", "What the bot can do"),
)

HELP = "\n".join(
    [
        "<b>Runtime City · ops</b>",
        *(f"/{name} — {escape(text)}" for name, text in COMMANDS),
        "",
        "Alerts come by themselves when something really breaks; the failures visitors ask for "
        "in the playground do not raise them.",
    ]
)

OK, BAD = "✅", "⚠️"


def _queue_line(queue: QueueState) -> str:
    if queue.dead_letters:
        mark = BAD if queue.messages else OK
        return f"{mark} <code>{escape(queue.name)}</code> — {queue.messages} dead letter(s)"
    mark = OK if queue.consumers else BAD
    return (
        f"{mark} <code>{escape(queue.name)}</code> — {queue.messages} waiting, "
        f"{queue.consumers} consumer(s)"
    )


def _unreadable(parts: Mapping[str, str]) -> list[str]:
    return [f"{BAD} cannot read {escape(part)}: {escape(reason)}" for part, reason in parts.items()]


def render_status(report: StatusReport) -> str:
    lines = ["<b>Runtime City · status</b>", "", "<b>Services</b>"]
    for service in report.services:
        lines.append(
            f"{OK if service.ok else BAD} {escape(service.name)} — {escape(service.detail)}"
        )
    if report.queues:
        lines += ["", "<b>Queues</b>", *(_queue_line(queue) for queue in report.queues)]
    lines += ["", "<b>Events</b>"]
    if report.outbox is not None:
        outbox = report.outbox
        oldest = (
            f", the oldest for {describe_age(outbox.oldest_s)}"
            if outbox.oldest_s is not None
            else ""
        )
        lines.append(f"Outbox — {outbox.unpublished} unpublished{oldest}")
    if report.lag:
        groups = " · ".join(f"{escape(group)} {behind}" for group, behind in report.lag.items())
        lines.append(f"Lag — {groups}")
    lines += _unreadable(report.unreadable)
    return "\n".join(lines)


def _failure_line(task: FailedTask) -> str:
    cause = "fault injection" if task.injected else "real failure"
    return (
        f"• <code>{str(task.task_id)[:8]}</code> {escape(task.kind)}, {task.attempts} attempt(s), "
        f"{describe_age(task.age_s)} ago — {escape(task.error or 'no reason recorded')} ({cause})"
    )


def render_dead_letters(view: DeadLetters) -> str:
    lines = ["<b>Dead letters</b>", *(_queue_line(queue) for queue in view.queues)]
    if view.failures:
        lines += ["", "<b>Failed in the last 30 min</b>", *map(_failure_line, view.failures)]
    elif not view.unreadable:
        lines += ["", "No task failed in the last 30 min."]
    lines += _unreadable(view.unreadable)
    return "\n".join(lines)


def render_replay(result: ReplayResult) -> str:
    text = f"Replayed {result.replayed} from <code>{escape(result.queue)}</code>"
    if result.dropped:
        text += f"; removed {result.dropped} whose task is gone (the sandbox expired)"
    return text + "."


def render_changes(changes: Changes) -> str:
    lines = [f"{BAD} {escape(problem.text)}" for problem in changes.raised]
    lines += [f"{OK} Resolved: {escape(text)}" for text in changes.resolved]
    return "\n".join(lines)


def render_open(problems: list[str]) -> str:
    if not problems:
        return f"{OK} No open problems."
    return "\n".join(["<b>Open problems</b>", *(f"{BAD} {escape(text)}" for text in problems)])
