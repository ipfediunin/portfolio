import type { LiveTraceCursor } from "../live/live-exchange";
import type { Step } from "../scenarios/catalog";
import type { StepContext, StepOutcome } from "./step-context";

type DedupeStep = Extract<Step, { type: "dedupe" }>;

/** Simulation: an event id seen before (in this session) skips straight to the response. */
export function dedupe(
  ctx: StepContext,
  step: DedupeStep,
  processed: Set<string>,
): StepOutcome {
  const { run, state } = ctx;
  const eventId = String(state.payload?.[step.field] ?? "");
  const duplicate = processed.has(eventId);
  state.t = run.span(
    state.at,
    `check event id ${eventId}`,
    state.t,
    [0.4, 1.2],
    { note: duplicate ? "webhookIgnored" : "webhookFirst", onSyncPath: true },
  );
  if (!duplicate) {
    processed.add(eventId);
    return "continue";
  }
  run.status(state.t, state.at, "cached", "Duplicate · ignored");
  run.log(state.t, "warn", state.at, `${eventId} already processed · skipped`);
  state.headers["x-idempotent-replay"] = "true";
  return ctx.respond({
    status: 200,
    statusText: "OK",
    body: { received: true, duplicate: true },
    headers: {},
  });
}

function eventIdOf(body: string | null, field: string): string {
  try {
    const parsed: unknown = JSON.parse(body ?? "");
    if (parsed !== null && typeof parsed === "object" && field in parsed) {
      const value: unknown = (parsed as Record<string, unknown>)[field];
      if (typeof value === "string") return value;
    }
  } catch {
    // Not JSON: the service refused it before this step, so the id is never shown.
    return "event";
  }
  return "event";
}

/**
 * Live: the service records the event in PostgreSQL, and a unique constraint makes a repeated
 * delivery a no-op. Whether it was new comes from the service's answer.
 */
export function dedupeLive(
  ctx: StepContext,
  step: DedupeStep,
  live: LiveTraceCursor,
): StepOutcome {
  const { run, state, input } = ctx;
  const record = live.take("db");
  // The service answered before it got here (401, 400 for a bad signature, 422).
  if (!record) return "continue";
  state.t = step.link
    ? ctx.roundTrip(
        step.link,
        record.name,
        [0.4, 1.2],
        "dbQuery",
        state.t,
        record,
      )
    : run.span(state.at, record.name, state.t, [0.4, 1.2], {
        onSyncPath: true,
        reportedMs: record.duration_ms,
      });
  const body = live.exchange.response.body;
  const duplicate =
    body !== null &&
    typeof body === "object" &&
    "duplicate" in body &&
    body.duplicate === true;
  const eventId = eventIdOf(input.body, step.field);
  if (!duplicate) {
    run.note(state.t, "webhookFirst");
    return "continue";
  }
  run.note(state.t, "webhookIgnored");
  run.status(state.t, state.at, "cached", "Duplicate · ignored");
  run.log(state.t, "warn", state.at, `${eventId} already processed · skipped`);
  state.skipToResponse = true;
  return "continue";
}
