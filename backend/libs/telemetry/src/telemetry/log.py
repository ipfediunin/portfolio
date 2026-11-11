"""JSON log lines on stdout, each with the trace id of the work it belongs to. Nothing that
identifies a visitor is logged: no IP addresses, tokens or request bodies."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from telemetry.tracing import current_trace


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str) -> None:
        super().__init__()
        self._service = service

    def format(self, record: logging.LogRecord) -> str:
        recorder = current_trace.get()
        line: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "service": self._service,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        trace_id = getattr(record, "trace_id", None) or (recorder.trace_id if recorder else None)
        if trace_id:
            line["trace_id"] = trace_id
        if record.exc_info:
            line["error"] = self.formatException(record.exc_info)
        return json.dumps(line, ensure_ascii=False)


def configure_logging(service: str, level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Uvicorn's access log would print client IPs; requests are visible through traces instead.
    logging.getLogger("uvicorn.access").disabled = True
    # aio-pika logs every reconnect attempt at INFO with the broker URL; warnings are enough.
    logging.getLogger("aio_pika").setLevel(max(logging.WARNING, root.level))
    logging.getLogger("aiormq").setLevel(max(logging.WARNING, root.level))
    # httpx logs every request URL at INFO, and a URL can carry a secret (the Telegram bot token
    # is part of the Bot API's path).
    logging.getLogger("httpx").setLevel(max(logging.WARNING, root.level))
