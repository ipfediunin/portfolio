"""The consumer loop: one attempt per delivery.

A message is acknowledged only after its next step is safely stored: the task's outcome in
PostgreSQL, a confirmed copy on a retry queue, or a confirmed copy in the dead-letter queue. If the
worker dies in between, RabbitMQ delivers the message again (at-least-once) — which is why
handlers are idempotent: the provider gets the task id as its idempotency key, and finishing a
task only changes a task that is still queued."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from aio_pika.abc import AbstractIncomingMessage
from pydantic import ValidationError
from redis.exceptions import RedisError

from contracts import JOB_ADAPTER, ChargeJob, Notification, NotificationEvent, ReportJob
from messaging import Broker, QueueUnavailable, Topology
from messaging.notifications import NOTIFY_OPERATION, Notifier
from order_worker.failures import PermanentFailure, TransientFailure
from order_worker.handlers import Handlers
from order_worker.repository import WorkerRepository
from telemetry import SpanRecorder, current_trace, span
from telemetry.background import BackgroundTraces

logger = logging.getLogger(__name__)

SERVICE_NAME = "order-worker"
# Before a message that could not be moved on is handed back for redelivery.
REQUEUE_PAUSE_S = 1.0
# What the page hears when a task ends: (succeeded, failed) per job kind.
_OUTCOMES: dict[str, tuple[NotificationEvent, NotificationEvent]] = {
    "report": ("report.ready", "report.failed"),
    "charge": ("payment.succeeded", "payment.failed"),
}


class JobWorker:
    def __init__(
        self,
        broker: Broker,
        handlers: Handlers,
        repository: WorkerRepository,
        traces: BackgroundTraces,
        notifier: Notifier,
        *,
        name: str,
        prefetch: int,
    ) -> None:
        self._broker = broker
        self._handlers = handlers
        self._repository = repository
        self._traces = traces
        self._notifier = notifier
        self._name = name
        self._prefetch = prefetch
        self._in_flight: set[asyncio.Task[object]] = set()

    @property
    def topology(self) -> Topology:
        return self._broker.topology

    async def run(self, stop: asyncio.Event, *, grace_seconds: float = 10.0) -> None:
        """Consumes every job queue until `stop` is set, then lets running attempts finish."""
        channel = await self._broker.connection.channel()
        await channel.set_qos(prefetch_count=self._prefetch)
        consumers = []
        for job_queue in self.topology.queues:
            # Declared by Broker.connect; `get_queue` only checks that it exists.
            queue = await channel.get_queue(job_queue.name)
            consumers.append((queue, await queue.consume(self._on_message)))
        logger.info(
            "Worker %s consuming %s (prefetch %d)",
            self._name,
            ", ".join(job_queue.name for job_queue in self.topology.queues),
            self._prefetch,
        )
        try:
            await stop.wait()
        finally:
            for queue, tag in consumers:
                await queue.cancel(tag)
            if self._in_flight:
                logger.info("Waiting for %d running job(s)", len(self._in_flight))
                await asyncio.wait(set(self._in_flight), timeout=grace_seconds)
            # Unacknowledged messages go back to the queue when the channel closes.
            await channel.close()

    async def _on_message(self, message: AbstractIncomingMessage) -> None:
        task = asyncio.current_task()
        if task is not None:
            self._in_flight.add(task)
        try:
            await self.handle(message)
        finally:
            if task is not None:
                self._in_flight.discard(task)

    async def handle(self, message: AbstractIncomingMessage) -> None:
        try:
            job = JOB_ADAPTER.validate_json(message.body)
        except ValidationError:
            # Retrying cannot fix a malformed message; the work queue dead-letters a rejection.
            logger.exception(
                "Malformed job message %s moved to the dead-letter queue", message.message_id
            )
            await message.reject(requeue=False)
            return
        recorder = SpanRecorder(
            job.trace_id,
            SERVICE_NAME,
            origin_ms=(time.time() - job.trace_started_at) * 1000,
        )
        token = current_trace.set(recorder)
        try:
            await self._attempt(job, message, recorder)
        finally:
            current_trace.reset(token)

    async def _attempt(
        self, job: ReportJob | ChargeJob, message: AbstractIncomingMessage, recorder: SpanRecorder
    ) -> None:
        queue = self.topology.queue(job.kind)
        max_attempts = self.topology.retry.max_attempts
        with span("consume", f"consume {queue.name} attempt {job.attempt}/{max_attempts}") as taken:
            taken.attributes.update(
                {
                    "attempt": job.attempt,
                    "max_attempts": max_attempts,
                    "queued_ms": round(max(0.0, time.time() - job.enqueued_at) * 1000, 1),
                    "worker": self._name,
                    # RabbitMQ delivered it before, to a consumer that did not acknowledge it
                    # (a worker that died mid-job): the handlers are idempotent for this.
                    "redelivered": bool(message.redelivered),
                }
            )
        # Stored right away, so a watcher sees the job being worked on before it ends.
        await self._traces.append(job.trace_id, recorder.drain())

        try:
            await self._handlers.run(job)
        except TransientFailure as failure:
            await self._after_failure(job, message, recorder, str(failure), retryable=True)
            return
        except PermanentFailure as failure:
            await self._after_failure(job, message, recorder, str(failure), retryable=False)
            return
        except Exception as error:
            # A bug, not an outage: retrying blindly would repeat it. Keep the job for inspection.
            logger.exception("Task %s failed unexpectedly", job.task_id)
            reason = f"unexpected {type(error).__name__}"
            await self._after_failure(job, message, recorder, reason, retryable=False)
            return

        logger.info("Task %s (%s) done on attempt %d", job.task_id, job.kind, job.attempt)
        # The notification goes out before the trace is marked done: the hub records its push
        # into the trace before it tells the page the trace is complete.
        await self._notify(job, succeeded=True)
        await self._traces.append(job.trace_id, recorder.drain())
        await self._traces.finish(job.trace_id)
        await message.ack()

    async def _after_failure(
        self,
        job: ReportJob | ChargeJob,
        message: AbstractIncomingMessage,
        recorder: SpanRecorder,
        reason: str,
        *,
        retryable: bool,
    ) -> None:
        delay_ms = self.topology.retry.delay_after(job.attempt) if retryable else None
        try:
            if delay_ms is not None:
                await self._schedule_retry(job, delay_ms, reason)
            else:
                await self._dead_letter(job, reason)
        except QueueUnavailable:
            # The next step could not be stored: hand the message back. RabbitMQ redelivers it,
            # and after `x-delivery-limit` deliveries moves it to the dead-letter queue itself.
            logger.warning("Task %s could not be moved on; requeued", job.task_id, exc_info=True)
            await self._traces.append(job.trace_id, recorder.drain())
            await asyncio.sleep(REQUEUE_PAUSE_S)
            await message.nack(requeue=True)
            return
        if delay_ms is None:
            await self._notify(job, succeeded=False)
        await self._traces.append(job.trace_id, recorder.drain())
        if delay_ms is None:
            await self._traces.finish(job.trace_id)
        await message.ack()

    async def _notify(self, job: ReportJob | ChargeJob, *, succeeded: bool) -> None:
        """Tells the page how the task ended (pushed by the realtime hub if the page listens).
        Like tracing, it never decides the job's fate: if Redis is down, the page polls."""
        if not self._notifier.listens_for(job.owner_key):
            return
        ready, failed = _OUTCOMES[job.kind]
        notification = Notification(
            event=ready if succeeded else failed,
            task_id=job.task_id,
            order_id=job.order_id if isinstance(job, ChargeJob) else None,
            trace_id=job.trace_id,
            trace_started_at=job.trace_started_at,
            at=datetime.now(UTC),
        )
        try:
            async with span("notify", NOTIFY_OPERATION) as step:
                step.attributes["event"] = notification.event
                await self._notifier.notify(job.owner_key, notification, once=f"task:{job.task_id}")
        except (RedisError, OSError):
            logger.warning("Task %s: could not notify the page", job.task_id, exc_info=True)

    async def _schedule_retry(self, job: ReportJob | ChargeJob, delay_ms: int, reason: str) -> None:
        retry_queue = self.topology.queue(job.kind).retry_queue(delay_ms)
        async with span("retry", f"basic.publish {retry_queue} (confirm)") as step:
            step.attributes.update(
                {"delay_ms": delay_ms, "next_attempt": job.attempt + 1, "reason": reason[:120]}
            )
            await self._broker.publish_to_queue(
                retry_queue,
                job.model_copy(update={"attempt": job.attempt + 1, "enqueued_at": time.time()}),
            )
        logger.warning(
            "Task %s attempt %d/%d failed (%s); retry in %d ms",
            job.task_id,
            job.attempt,
            self.topology.retry.max_attempts,
            reason,
            delay_ms,
        )

    async def _dead_letter(self, job: ReportJob | ChargeJob, reason: str) -> None:
        dead_letters = self.topology.queue(job.kind).dead_letters
        async with span("dead_letter", f"basic.publish {dead_letters} (confirm)") as step:
            step.attributes.update({"attempts": job.attempt, "reason": reason[:120]})
            await self._broker.publish_to_queue(
                dead_letters, job, headers={"x-last-error": reason[:200], "x-attempts": job.attempt}
            )
        logger.error(
            "Task %s moved to the dead-letter queue after %d attempt(s): %s",
            job.task_id,
            job.attempt,
            reason,
        )
        try:
            await self._repository.finish(job.task_id, "failed", job.attempt, error=reason)
        except TransientFailure:
            # The job is safe in the DLQ; the task row keeps "queued" until it expires.
            logger.warning("Task %s: could not record the failure", job.task_id, exc_info=True)
