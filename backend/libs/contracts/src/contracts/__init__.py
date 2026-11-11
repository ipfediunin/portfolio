"""Shared data contracts of the Runtime City backend.

The models here are the formats services exchange with each other and with the website. The
website validates the trace format with Zod (`src/simulation/live/live-exchange.ts`); the JSON
fixtures in `libs/contracts/fixtures` are checked by both test suites so the two stay in step.
"""

from contracts.events import (
    ORDER_EVENT_GROUPS,
    ORDER_EVENT_TRACE_PARTS,
    ORDER_EVENTS_PARTITIONS,
    ORDER_EVENTS_TOPIC,
    OrderCreated,
    background_parts_key,
)
from contracts.jobs import JOB_ADAPTER, ChargeJob, Currency, Job, JobKind, ReportJob
from contracts.realtime import (
    CLIENT_MESSAGE,
    EVENTS_CHANNEL_PATTERN,
    TRACES_DONE_CHANNEL,
    AuthMessage,
    CloseCode,
    Notification,
    NotificationEvent,
    NotificationMessage,
    ReadyMessage,
    TraceDoneMessage,
    WatchMessage,
    events_channel,
    notifications_key,
)
from contracts.sandbox import (
    SandboxRecord,
    client_key,
    is_sandbox_owner,
    sandbox_key,
    token_hash,
)
from contracts.trace import (
    MAX_SPANS,
    TRACE_STARTED_AT_HEADER,
    Background,
    HttpMethod,
    SpanKind,
    Trace,
    TraceSpan,
    background_done_key,
    background_spans_key,
    remote_spans_key,
    trace_key,
)
from contracts.webhooks import SIGNATURE_HEADER, WebhookEvent

__all__ = [
    "CLIENT_MESSAGE",
    "EVENTS_CHANNEL_PATTERN",
    "JOB_ADAPTER",
    "MAX_SPANS",
    "ORDER_EVENTS_PARTITIONS",
    "ORDER_EVENTS_TOPIC",
    "ORDER_EVENT_GROUPS",
    "ORDER_EVENT_TRACE_PARTS",
    "SIGNATURE_HEADER",
    "TRACES_DONE_CHANNEL",
    "TRACE_STARTED_AT_HEADER",
    "AuthMessage",
    "Background",
    "ChargeJob",
    "CloseCode",
    "Currency",
    "HttpMethod",
    "Job",
    "JobKind",
    "Notification",
    "NotificationEvent",
    "NotificationMessage",
    "OrderCreated",
    "ReadyMessage",
    "ReportJob",
    "SandboxRecord",
    "SpanKind",
    "Trace",
    "TraceDoneMessage",
    "TraceSpan",
    "WatchMessage",
    "WebhookEvent",
    "background_done_key",
    "background_parts_key",
    "background_spans_key",
    "client_key",
    "events_channel",
    "is_sandbox_owner",
    "notifications_key",
    "remote_spans_key",
    "sandbox_key",
    "token_hash",
    "trace_key",
]
