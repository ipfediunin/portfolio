import type { LiveTraceCursor } from "../live/live-exchange";
import type { Step } from "../scenarios/catalog";
import { QUEUE_WAIT_MS, runJob } from "./background-work";
import { measured, type StepContext, type StepOutcome } from "./step-context";

type PublishStep = Extract<Step, { type: "publish" }>;

/** Simulation: the job goes to the broker and the worker's whole story is compiled right away. */
export function publish(ctx: StepContext, step: PublishStep): StepOutcome {
  const { run, state, input } = ctx;
  const link = ctx.link(step.link);
  const taskId = ctx.hexId(8);
  state.headers["x-task-id"] = taskId;
  state.t = run.span(state.at, `publish ${step.queue}`, state.t, [1, 3], {
    note: "brokerPublish",
    onSyncPath: true,
  });
  const jobPacket = run.newPacket();
  const queuedAt = run.hop(
    jobPacket,
    "job",
    "neutral",
    link.id,
    false,
    state.t,
    false,
  );
  run.status(queuedAt, link.to, "queued", `Queued · ${step.queue}`);
  run.log(
    queuedAt,
    "info",
    link.to,
    `task ${taskId} queued in "${step.queue}"`,
  );
  runJob(ctx.background(), step.job, {
    packetId: jobPacket,
    brokerId: link.to,
    startAt: queuedAt + QUEUE_WAIT_MS,
    taskId,
    providerFailures: input.options.providerFailures,
  });
  return "continue";
}

/**
 * Live: the job as the service published it. A refused publish (full queue, broker down) ends the
 * request with the service's 503; an accepted one parks the van at the broker until the worker's
 * part of the trace is in.
 */
export function publishLive(
  ctx: StepContext,
  step: PublishStep,
  live: LiveTraceCursor,
): StepOutcome {
  const { run, state } = ctx;
  const link = ctx.link(step.link);
  const published = live.take("publish");
  // The service answered before queuing anything (404, or 422 after its database check).
  if (!published) return "continue";
  state.t = run.span(state.at, published.name, state.t, [1, 3], {
    ok: published.ok,
    note: "brokerPublish",
    onSyncPath: true,
    ...measured(published),
  });
  const queue =
    typeof published.attributes.queue === "string"
      ? published.attributes.queue
      : step.queue;
  if (!published.ok) {
    run.status(state.t, link.to, "failed", "Job refused");
    run.log(
      state.t,
      "warn",
      link.to,
      `"${queue}" refused the job: the queue is full or unreachable`,
    );
    return "continue";
  }
  const body = live.exchange.response.body;
  const taskId =
    body !== null &&
    typeof body === "object" &&
    "task_id" in body &&
    typeof body.task_id === "string"
      ? body.task_id
      : "?";
  const packetId = run.newPacket();
  const queuedAt = run.hop(
    packetId,
    "job",
    "neutral",
    link.id,
    false,
    state.t,
    false,
  );
  run.status(queuedAt, link.to, "queued", `Queued · ${step.queue}`);
  run.log(queuedAt, "info", link.to, `task ${taskId} queued in "${queue}"`);
  state.queued = {
    kind: "job",
    packetId,
    brokerId: link.to,
    taskId,
    readyAt: queuedAt + QUEUE_WAIT_MS,
    steps: step.job,
  };
  return "continue";
}
