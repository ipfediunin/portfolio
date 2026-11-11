import type { LiveBackground, LiveSpan } from "../live/live-exchange";
import type { FanoutConsumer, JobStep } from "../scenarios/catalog";
import {
  BACKOFF_PLAYBACK_PER_SECOND,
  FANOUT_STAGGER_MS,
  type BackgroundContext,
} from "./background-work";

/**
 * Replays the work a request queued, from the background part of its trace: a job the order
 * worker took from RabbitMQ (`replayBackground`), or an order event the outbox relay published to
 * Kafka for the consumer groups (`replayFanout`). The scenario's steps only say where things are
 * (which worker, provider, dead-letter queue, database, which link leads to which group); what
 * happened, how long it took and where the work ended up all come from the trace.
 *
 * Nothing is added that the backend did not do: the push to the page is drawn only when the
 * realtime hub recorded one (the page had its socket open), and there is no monitoring alert for
 * the dead-letter queue.
 */

export interface QueuedJob {
  /** The job's van, parked at the broker since the request published it. */
  readonly packetId: string;
  readonly brokerId: string;
  readonly taskId: string;
  /** Playback time the replay starts at. */
  readonly startAt: number;
}

const REASONS: Readonly<Record<number, string>> = {
  200: "OK",
  201: "Created",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Server Error",
  502: "Bad Gateway",
  503: "Unavailable",
  504: "Timeout",
};

function providerStatus(span: LiveSpan): string {
  const status = span.attributes.status;
  if (typeof status !== "number") return "No answer";
  return `${status} ${REASONS[status] ?? ""}`.trim();
}

function numberAttribute(span: LiveSpan, name: string): number | null {
  const value = span.attributes[name];
  return typeof value === "number" ? value : null;
}

function eventOf(span: LiveSpan): string {
  const event = span.attributes.event;
  return typeof event === "string" ? event : "notification";
}

function toneOf(event: string): "success" | "failed" {
  return event.endsWith(".failed") ? "failed" : "success";
}

/** The hub sent a notification over the page's socket: its span, then the trip to the page. */
function replayPush(
  { run }: BackgroundContext,
  push: LiveSpan,
  route: { readonly hub: string; readonly toPage: string },
  startAt: number,
): number {
  const event = eventOf(push);
  const tone = toneOf(event);
  let t = run.span(route.hub, push.name, startAt, [0, 0], {
    ok: push.ok,
    note: "push",
    onSyncPath: false,
    reportedMs: push.duration_ms,
  });
  t = run.hop(run.newPacket(), "event", tone, route.toPage, false, t, false);
  run.status(t, route.hub, tone, `ws · ${event}`);
  run.log(
    t,
    tone === "failed" ? "error" : "info",
    route.hub,
    `pushed ${event} to the page over WebSocket`,
  );
  return t;
}

export function replayBackground(
  context: BackgroundContext,
  steps: readonly JobStep[],
  job: QueuedJob,
  background: LiveBackground,
): void {
  const { run, link } = context;
  const consume = steps.find(
    (step): step is Extract<JobStep, { type: "consume" }> =>
      step.type === "consume",
  );
  if (!consume) throw new Error("A queued job needs a consume step");
  const persist = steps.find(
    (step): step is Extract<JobStep, { type: "persist" }> =>
      step.type === "persist",
  );
  const emit = steps.find(
    (step): step is Extract<JobStep, { type: "emit" }> => step.type === "emit",
  );
  const [toHub, toPage] = emit?.links ?? [];
  const take = link(consume.link);
  const worker = take.to;
  const { packetId, brokerId, taskId } = job;

  let t = job.startAt;
  let attempt = 0;
  let maxAttempts = consume.retry.maxAttempts;
  let deadLettered = false;
  let notified: string | null = null;
  let pushed = false;

  for (const span of background.spans) {
    switch (span.kind) {
      case "consume": {
        attempt = numberAttribute(span, "attempt") ?? attempt + 1;
        maxAttempts = numberAttribute(span, "max_attempts") ?? maxAttempts;
        t = run.hop(
          packetId,
          "job",
          attempt > 1 ? "retry" : "neutral",
          take.id,
          false,
          t,
          false,
        );
        run.status(
          t,
          worker,
          "processing",
          attempt > 1 ? `Attempt ${attempt}/${maxAttempts}` : "Processing",
        );
        const replica = span.attributes.worker;
        const waited = numberAttribute(span, "queued_ms");
        run.log(
          t,
          "info",
          worker,
          `attempt ${attempt}/${maxAttempts} taken${typeof replica === "string" ? ` by ${replica}` : ""}${waited === null ? "" : ` after ${Math.round(waited)} ms in the queue`}`,
        );
        t = run.span(worker, span.name, t, [0, 0], {
          ok: span.ok,
          note: "workerProcess",
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        break;
      }

      case "external": {
        if (!consume.external) break;
        const external = link(consume.external.link);
        const call = run.newPacket();
        t = run.hop(call, "request", "neutral", external.id, false, t, false);
        t = run.span(external.to, span.name, t, [0, 0], {
          ok: span.ok,
          note: "providerCall",
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        run.status(
          t,
          external.to,
          span.ok ? "success" : "failed",
          providerStatus(span),
        );
        t = run.hop(
          call,
          "response",
          span.ok ? "success" : "failed",
          external.id,
          true,
          t,
          false,
        );
        if (!span.ok)
          run.log(
            t,
            "warn",
            worker,
            `provider answered ${providerStatus(span)} (attempt ${attempt}/${maxAttempts})`,
          );
        break;
      }

      case "db": {
        if (!persist) break;
        const write = link(persist.link);
        const query = run.newPacket();
        t = run.hop(query, "request", "neutral", write.id, false, t, false);
        t = run.span(write.to, span.name, t, [0, 0], {
          ok: span.ok,
          note: "dbQuery",
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        t = run.hop(query, "response", "success", write.id, true, t, false);
        break;
      }

      case "retry": {
        const seconds = (numberAttribute(span, "delay_ms") ?? 0) / 1000;
        run.status(t, worker, "retry", `Retry in ${seconds}s`);
        run.note(t, "workerRetry");
        t = run.span(worker, span.name, t, [0, 0], {
          ok: span.ok,
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        t = run.hop(packetId, "job", "retry", take.id, true, t, false);
        run.status(
          t,
          brokerId,
          "retry",
          `Retry ${attempt + 1}/${maxAttempts} · ${seconds}s`,
        );
        t += seconds * BACKOFF_PLAYBACK_PER_SECOND;
        break;
      }

      case "dead_letter": {
        deadLettered = true;
        t = run.span(worker, span.name, t, [0, 0], {
          ok: span.ok,
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        t = run.hop(packetId, "job", "failed", take.id, true, t, false);
        t = run.hop(
          packetId,
          "job",
          "failed",
          consume.deadLetterLink,
          false,
          t,
          false,
        );
        run.status(
          t,
          link(consume.deadLetterLink).to,
          "failed",
          "Dead-lettered",
        );
        run.note(t, "deadLetter");
        run.log(
          t,
          "error",
          worker,
          `task ${taskId} moved to the dead-letter queue after ${attempt} attempts`,
        );
        break;
      }

      case "notify": {
        // The worker filed the outcome for the sandbox and published it to the hub.
        notified = eventOf(span);
        t = run.span(worker, span.name, t, [0, 0], {
          ok: span.ok,
          onSyncPath: false,
          reportedMs: span.duration_ms,
        });
        if (toHub)
          t = run.hop(
            run.newPacket(),
            "event",
            toneOf(notified),
            toHub,
            false,
            t,
            false,
          );
        break;
      }

      case "push": {
        if (!toHub || !toPage) break;
        t = replayPush(context, span, { hub: link(toHub).to, toPage }, t);
        pushed = true;
        break;
      }

      default:
        // Spans of other kinds are the API's; a worker does not record them.
        break;
    }
  }

  if (notified && !pushed && toHub) {
    const hub = link(toHub).to;
    run.status(t, hub, "queued", `${notified} · no socket`);
    run.log(
      t,
      "info",
      hub,
      `no WebSocket was open for this sandbox: the page fetched the trace instead`,
    );
  }

  if (background.state === "pending") {
    run.status(t, brokerId, "queued", "No result yet");
    run.log(t, "warn", brokerId, `task ${taskId} has not finished yet`);
  } else if (!deadLettered) {
    run.status(t, worker, "success", "Done");
    run.log(t, "info", worker, `task ${taskId} done`);
  }
}

/** An order event waiting in the service's outbox. */
export interface QueuedEvent {
  /** The node whose outbox holds the event. */
  readonly origin: string;
  /** Service → event log link the relay publishes along. */
  readonly link: string;
  readonly event: string;
  readonly consumers: readonly FanoutConsumer[];
  /** Playback time the replay starts at. */
  readonly startAt: number;
}

function position(span: LiveSpan): string {
  const partition = numberAttribute(span, "partition");
  const offset = numberAttribute(span, "offset");
  if (partition === null) return "";
  return offset === null ? `p${partition}` : `p${partition}@${offset}`;
}

/**
 * The relay's publish, then each consumer group's spans (tagged with its `group`) along the link
 * that leads to it. A group may read the event more than once (at-least-once delivery): every
 * read is shown, and the trace says what it did.
 */
export function replayFanout(
  context: BackgroundContext,
  queued: QueuedEvent,
  background: LiveBackground,
): void {
  const { run, link } = context;
  const publishLink = link(queued.link);
  const log = publishLink.to;
  let t = queued.startAt;
  const publishes = background.spans.filter((span) => span.kind === "publish");

  if (publishes.length === 0) {
    // Kafka or the relay is down: the order is safe, its event waits in the outbox.
    run.status(t, queued.origin, "queued", `Outbox · ${queued.event} waiting`);
    run.log(
      t,
      "warn",
      queued.origin,
      `${queued.event} is still in the outbox: the relay has not published it yet`,
    );
    return;
  }

  for (const publish of publishes) {
    run.status(t, queued.origin, "success", "Outbox · published");
    t = run.hop(
      run.newPacket(),
      "event",
      "neutral",
      publishLink.id,
      false,
      t,
      false,
    );
    t = run.span(log, publish.name, t, [0, 0], {
      ok: publish.ok,
      onSyncPath: false,
      reportedMs: publish.duration_ms,
    });
    run.status(t, log, "queued", `${queued.event} · ${position(publish)}`);
    run.log(
      t,
      "info",
      log,
      `${queued.event} published to ${position(publish)} (key ${String(publish.attributes.key ?? "?")})`,
    );
  }
  run.note(t, "fanoutDeliver");

  let last = t;
  queued.consumers.forEach((consumer, index) => {
    const delivered = link(consumer.link);
    const spans = background.spans.filter(
      (span) => span.attributes.group === consumer.group,
    );
    if (!spans.some((span) => span.kind === "consume")) {
      run.log(
        t,
        "warn",
        delivered.to,
        `group ${consumer.group} has not read ${queued.event} yet`,
      );
      return;
    }
    let at = t + index * FANOUT_STAGGER_MS;
    for (const span of spans) {
      if (span.kind === "consume") {
        at = run.hop(
          run.newPacket(),
          "event",
          "neutral",
          delivered.id,
          false,
          at,
          false,
        );
        const replica = span.attributes.worker;
        run.log(
          at,
          "info",
          delivered.to,
          `group ${consumer.group} read ${queued.event} at ${position(span)}${typeof replica === "string" ? ` on ${replica}` : ""}`,
        );
      }
      at = run.span(delivered.to, span.name, at, [0, 0], {
        ok: span.ok,
        onSyncPath: false,
        reportedMs: span.duration_ms,
      });
    }
    const ok = spans.every((span) => span.ok);
    run.status(
      at,
      delivered.to,
      ok ? "success" : "failed",
      ok ? consumer.label : `${consumer.group} · failed`,
    );
    if (consumer.push)
      for (const push of background.spans.filter(
        (span) => span.kind === "push",
      ))
        at = replayPush(
          context,
          push,
          { hub: delivered.to, toPage: consumer.push },
          at,
        );
    last = Math.max(last, at);
  });

  if (background.state === "pending") {
    run.status(last, log, "queued", "Groups still reading");
    run.log(
      last,
      "warn",
      log,
      `not every group has handled ${queued.event} yet`,
    );
  }
}
