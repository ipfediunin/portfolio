import type { LinkSpec } from "../model/graph";
import type {
  FanoutConsumer,
  JobStep,
  LatencyRange,
} from "../scenarios/catalog";
import type { RunBuilder } from "./run-builder";

/** Playback ms a job waits in the queue before a worker picks it up. */
export const QUEUE_WAIT_MS = 300;
/** Playback ms per realistic second of retry backoff. */
export const BACKOFF_PLAYBACK_PER_SECOND = 650;
/** Background explanations wait until the client has its answer, so they are not replaced at once. */
const BACKGROUND_NOTE_DELAY_MS = 1200;
/** Playback ms a fresh worker replica needs before it takes jobs. */
const REPLICA_START_MS = 900;
/** Fanned-out events leave the broker this far apart, so the packets read as separate. */
export const FANOUT_STAGGER_MS = 90;

/** What background work needs from the session: the run being built and the graph. */
export interface BackgroundContext {
  readonly run: RunBuilder;
  readonly link: (linkId: string) => LinkSpec;
  readonly hasNode: (nodeId: string) => boolean;
}

/** A queued task: consumer with retries, persistence, notification. */
export function runJob(
  { run, link, hasNode }: BackgroundContext,
  steps: readonly JobStep[],
  job: {
    readonly packetId: string;
    readonly brokerId: string;
    readonly startAt: number;
    readonly taskId: string;
    readonly providerFailures: number;
  },
): void {
  const { packetId, brokerId, taskId } = job;
  let t = job.startAt;
  let succeeded = true;

  for (const step of steps) {
    if (step.type === "consume") {
      const consume = link(step.link);
      const worker = consume.to;
      const { maxAttempts, baseDelayMs } = step.retry;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        t = run.hop(
          packetId,
          "job",
          attempt > 1 ? "retry" : "neutral",
          consume.id,
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
        t = run.span(
          worker,
          `${step.operation} (attempt ${attempt})`,
          t,
          step.latency,
          { note: "workerProcess", onSyncPath: false },
        );

        let attemptOk = true;
        if (step.external) {
          const external = link(step.external.link);
          const call = run.newPacket();
          t = run.hop(call, "request", "neutral", external.id, false, t, false);
          attemptOk = attempt > job.providerFailures;
          t = run.span(
            external.to,
            step.external.operation,
            t,
            step.external.latency,
            { ok: attemptOk, note: "providerCall", onSyncPath: false },
          );
          run.status(
            t,
            external.to,
            attemptOk ? "success" : "failed",
            attemptOk ? "200 OK" : "503 Unavailable",
          );
          t = run.hop(
            call,
            "response",
            attemptOk ? "success" : "failed",
            external.id,
            true,
            t,
            false,
          );
          if (!attemptOk) {
            run.log(
              t,
              "warn",
              worker,
              `provider returned 503 (attempt ${attempt}/${maxAttempts})`,
            );
          }
        }

        if (attemptOk) {
          run.status(t, worker, "success", "Done");
          run.log(t, "info", worker, `task ${taskId} done`);
          succeeded = true;
          break;
        }

        if (attempt < maxAttempts) {
          const backoffSeconds = (baseDelayMs * 2 ** (attempt - 1)) / 1000;
          run.status(t, worker, "retry", `Retry in ${backoffSeconds}s`);
          run.note(t, "workerRetry");
          t = run.hop(packetId, "job", "retry", consume.id, true, t, false);
          run.status(
            t,
            brokerId,
            "retry",
            `Retry ${attempt + 1}/${maxAttempts} · ${backoffSeconds}s`,
          );
          t += backoffSeconds * BACKOFF_PLAYBACK_PER_SECOND;
          continue;
        }

        succeeded = false;
        t = run.hop(packetId, "job", "failed", consume.id, true, t, false);
        t = run.hop(
          packetId,
          "job",
          "failed",
          step.deadLetterLink,
          false,
          t,
          false,
        );
        const deadLetters = link(step.deadLetterLink).to;
        run.status(t, deadLetters, "failed", "Dead-lettered");
        run.note(t, "deadLetter");
        run.log(
          t,
          "error",
          worker,
          `task ${taskId} moved to DLQ after ${maxAttempts} attempts`,
        );
        if (hasNode("monitoring"))
          run.status(t, "monitoring", "failed", "Alert · DLQ");
      }
    }

    if (step.type === "persist" && succeeded) {
      const persist = link(step.link);
      const packet = run.newPacket();
      t = run.hop(packet, "request", "neutral", persist.id, false, t, false);
      t = run.span(persist.to, step.operation, t, step.latency, {
        note: "dbQuery",
        onSyncPath: false,
      });
      t = run.hop(packet, "response", "success", persist.id, true, t, false);
    }

    if (step.type === "emit") {
      const event = succeeded ? step.successEvent : step.failureEvent;
      const packet = run.newPacket();
      for (const linkId of step.links) {
        t = run.hop(
          packet,
          "event",
          succeeded ? "success" : "failed",
          linkId,
          false,
          t,
          false,
        );
      }
      const hub = link(step.links[0] ?? "").to;
      run.status(t, hub, succeeded ? "success" : "failed", `ws · ${event}`);
      run.note(t, "push");
      run.log(t, succeeded ? "info" : "error", hub, `push ${event} → client`);
    }
  }
}

/** One event, delivered by the broker to every subscriber in parallel. */
export function runFanout(
  { run, link }: BackgroundContext,
  consumers: readonly FanoutConsumer[],
  delivery: {
    readonly brokerId: string;
    readonly event: string;
    readonly startAt: number;
  },
): void {
  const { brokerId, event, startAt } = delivery;
  run.status(
    startAt,
    brokerId,
    "queued",
    `${event} → ${consumers.length} queues`,
  );
  run.note(startAt + BACKGROUND_NOTE_DELAY_MS, "fanoutDeliver");
  consumers.forEach((consumer, index) => {
    const delivered = link(consumer.link);
    const packet = run.newPacket();
    let t = run.hop(
      packet,
      "event",
      "neutral",
      delivered.id,
      false,
      startAt + index * FANOUT_STAGGER_MS,
      false,
    );
    t = run.span(
      delivered.to,
      `${event}: ${consumer.operation}`,
      t,
      consumer.latency,
      { onSyncPath: false },
    );
    run.status(t, delivered.to, "success", consumer.label);
    run.log(t, "info", delivered.to, `${event} → ${consumer.operation}`);
    if (consumer.push) {
      t = run.hop(packet, "event", "success", consumer.push, false, t, false);
      run.status(t, delivered.to, "success", `ws · ${event}`);
      run.note(t, "push");
      run.log(t, "info", delivered.to, `push ${event} → client`);
    }
  });
}

/**
 * Workers drain a queue of jobs; each job goes to whichever worker frees up first. With a worker
 * down (chaos), only the others consume until the autoscaler's replacement is ready.
 */
export function runJobBatch(
  { run, link }: BackgroundContext,
  batch: {
    readonly brokerId: string;
    /** When each job reached the broker. */
    readonly queuedAt: readonly number[];
    readonly workers: readonly string[];
    readonly operation: string;
    readonly latency: LatencyRange;
    readonly workerDown: boolean;
    readonly autoscaleAfterMs: number;
  },
): void {
  const { brokerId, queuedAt, operation, latency } = batch;
  const count = queuedAt.length;
  const first = queuedAt[0];
  const last = queuedAt.at(-1);
  if (first === undefined || last === undefined) return;
  const workers = batch.workers.map(link);
  const available = workers.map(() => first + QUEUE_WAIT_MS);

  run.status(last, brokerId, "queued", `Queue · ${count}`);
  const chaos = batch.workerDown && workers.length > 1;
  const replacementAt = first + batch.autoscaleAfterMs;
  if (chaos) available[0] = replacementAt + REPLICA_START_MS;

  let doneAt = last;
  let replacementUsed = false;
  for (let index = 0; index < count; index++) {
    const slot = available.indexOf(Math.min(...available));
    const worker = workers[slot];
    if (!worker) continue;
    if (chaos && slot === 0) replacementUsed = true;
    const start = Math.max(queuedAt[index] ?? last, available[slot] ?? last);
    const remaining = count - index - 1;
    run.status(
      start,
      brokerId,
      remaining > 0 ? "queued" : "processing",
      remaining > 0 ? `Queue · ${remaining}` : "Queue · last job",
    );
    const packet = run.newPacket();
    let t = run.hop(packet, "job", "neutral", worker.id, false, start, false);
    run.status(t, worker.to, "processing", `Job ${index + 1}/${count}`);
    t = run.span(worker.to, `${operation} ${index + 1}/${count}`, t, latency, {
      onSyncPath: false,
    });
    available[slot] = t;
    doneAt = Math.max(doneAt, t);
  }

  // Events are sorted by time when the run is built, so the story around the jobs is told last.
  const lost = workers[0];
  if (chaos && lost) {
    run.status(first, lost.to, "failed", "Down · chaos");
    run.log(
      first,
      "error",
      lost.to,
      "worker lost · its jobs stay in the queue",
    );
    run.note(last + BACKGROUND_NOTE_DELAY_MS, "chaosDown");
    // A short queue drains before the autoscaler reacts: then there is nothing to scale.
    if (replacementUsed) {
      run.status(
        replacementAt,
        lost.to,
        "processing",
        "New replica · starting",
      );
      run.note(replacementAt, "chaosAutoscale");
      run.log(
        replacementAt,
        "info",
        brokerId,
        "queue depth above threshold · autoscaling workers 1 → 2",
      );
      run.status(
        replacementAt + REPLICA_START_MS,
        lost.to,
        "success",
        "Replica ready",
      );
    }
  } else {
    run.note(last + BACKGROUND_NOTE_DELAY_MS, "chaosShared");
  }

  run.status(doneAt, brokerId, "success", "Queue drained");
  run.note(doneAt, "chaosDrained");
  run.log(doneAt, "info", brokerId, `${count} jobs done · 0 lost`);
}
