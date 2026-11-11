import type { LiveSpan, LiveTraceCursor } from "../live/live-exchange";
import type { Step } from "../scenarios/catalog";
import type { CircuitBreaker } from "./circuit-breaker";
import { measured, type StepContext, type StepOutcome } from "./step-context";

type GuardedCallStep = Extract<Step, { type: "guardedCall" }>;

/** Simulation: a call behind a circuit breaker — fail fast while open, one trial when half-open. */
export function guardedCall(
  ctx: StepContext,
  step: GuardedCallStep,
  breaker: CircuitBreaker,
): StepOutcome {
  const { run, state, input, wallTime } = ctx;
  const link = ctx.link(step.link);
  const { failureThreshold, cooldownMs, timeoutMs } = step.breaker;
  const mode = breaker.request(wallTime);

  if (mode === "open") {
    state.t = run.span(
      state.at,
      "circuit open · fail fast",
      state.t,
      [0.2, 0.6],
      { ok: false, note: "breakerOpen", onSyncPath: true },
    );
    run.status(state.t, state.at, "failed", "Breaker OPEN · fail fast");
    run.log(
      state.t,
      "warn",
      state.at,
      `circuit to ${link.to} is open · not calling it`,
    );
    return ctx.respond({
      status: 503,
      statusText: "Service Unavailable",
      body: { detail: "Payment provider is unavailable, try again later" },
      headers: { "retry-after": String(cooldownMs / 1000) },
    });
  }

  if (mode === "half-open") {
    run.status(state.t, state.at, "retry", "Half-open · trial call");
    run.note(state.t, "breakerHalfOpen");
  }
  const packet = run.newPacket();
  state.t = run.hop(
    packet,
    "request",
    "neutral",
    link.id,
    false,
    state.t,
    true,
  );

  if (!input.options.providerDown) {
    state.t = run.span(link.to, step.operation, state.t, step.latency, {
      note: mode === "half-open" ? undefined : "providerCall",
      onSyncPath: true,
    });
    state.t = run.hop(
      packet,
      "response",
      "success",
      link.id,
      true,
      state.t,
      true,
    );
    breaker.record(true, wallTime);
    if (mode === "half-open") {
      run.status(state.t, state.at, "success", "Breaker CLOSED");
      run.note(state.t, "breakerClosed");
      run.log(
        state.t,
        "info",
        state.at,
        `trial call succeeded · circuit to ${link.to} closed`,
      );
    }
    return "continue";
  }

  // No answer: the caller waits out its timeout; the packet never comes back.
  state.t = run.span(
    link.to,
    `${step.operation} · no answer`,
    state.t,
    [timeoutMs, timeoutMs + 15],
    { ok: false, note: "breakerTimeout", onSyncPath: true },
  );
  run.status(state.t, link.to, "failed", `Timeout · ${timeoutMs / 1000} s`);
  const after = breaker.record(false, wallTime);
  if (after === "open") {
    run.status(state.t, state.at, "failed", "Breaker OPEN");
    run.note(state.t, "breakerTripped");
    run.log(
      state.t,
      "error",
      state.at,
      `${failureThreshold} failures in a row · circuit to ${link.to} opened`,
    );
  } else {
    run.status(
      state.t,
      state.at,
      "failed",
      `Failures ${breaker.failureCount}/${failureThreshold}`,
    );
  }
  return ctx.respond({
    status: 504,
    statusText: "Gateway Timeout",
    body: { detail: "Payment provider timed out" },
    headers: {},
  });
}

function breakerState(span: LiveSpan): string {
  return typeof span.attributes.state === "string"
    ? span.attributes.state
    : "closed";
}

/**
 * Live: what the Payments API's breaker decided (shared by its replicas, in Redis) and what the
 * provider did. The answer itself — 200, 504 after the timeout, 503 while open — is the service's.
 */
export function guardedCallLive(
  ctx: StepContext,
  step: GuardedCallStep,
  live: LiveTraceCursor,
): StepOutcome {
  const { run, state } = ctx;
  const link = ctx.link(step.link);
  const permission = live.take("breaker");
  // The request never reached the breaker (rate limited, or the payments service was down).
  if (!permission) return "continue";
  const decision = breakerState(permission);
  state.t = run.span(state.at, permission.name, state.t, [0.2, 0.6], {
    ok: permission.ok,
    note: decision === "open" ? "breakerOpen" : undefined,
    onSyncPath: true,
    ...measured(permission),
  });
  if (decision === "open") {
    run.status(state.t, state.at, "failed", "Breaker OPEN · fail fast");
    run.log(
      state.t,
      "warn",
      state.at,
      `circuit to ${link.to} is open · not calling it`,
    );
    return "continue";
  }
  if (decision === "half_open") {
    run.status(state.t, state.at, "retry", "Half-open · trial call");
    run.note(state.t, "breakerHalfOpen");
  }

  const call = live.take("external");
  const packet = run.newPacket();
  state.t = run.hop(
    packet,
    "request",
    "neutral",
    link.id,
    false,
    state.t,
    true,
  );
  const answered = call?.ok ?? false;
  if (answered) {
    state.t = run.span(
      link.to,
      call?.name ?? step.operation,
      state.t,
      step.latency,
      {
        note: decision === "half_open" ? undefined : "providerCall",
        onSyncPath: true,
        ...measured(call),
      },
    );
    state.t = run.hop(
      packet,
      "response",
      "success",
      link.id,
      true,
      state.t,
      true,
    );
  } else {
    // No answer in time: the Payments API gave up after its timeout; the packet never returns.
    state.t = run.span(
      link.to,
      `${call?.name ?? step.operation} · no answer`,
      state.t,
      step.latency,
      {
        ok: false,
        note: "breakerTimeout",
        onSyncPath: true,
        ...measured(call),
      },
    );
    const waited = call ? Math.round(call.duration_ms / 100) / 10 : null;
    run.status(
      state.t,
      link.to,
      "failed",
      waited === null ? "No answer" : `Timeout · ${waited} s`,
    );
  }

  const outcome = live.take("breaker");
  if (!outcome) return "continue";
  state.t = run.span(state.at, outcome.name, state.t, [0.2, 0.6], {
    onSyncPath: true,
    ...measured(outcome),
  });
  const after = breakerState(outcome);
  const failures =
    typeof outcome.attributes.failures === "number"
      ? outcome.attributes.failures
      : 0;
  if (!answered && after === "open") {
    run.status(state.t, state.at, "failed", "Breaker OPEN");
    run.note(state.t, "breakerTripped");
    run.log(
      state.t,
      "error",
      state.at,
      `${failures} failures in a row · circuit to ${link.to} opened`,
    );
  } else if (!answered) {
    run.status(
      state.t,
      state.at,
      "failed",
      `Failures ${failures}/${step.breaker.failureThreshold}`,
    );
  } else if (decision === "half_open") {
    run.status(state.t, state.at, "success", "Breaker CLOSED");
    run.note(state.t, "breakerClosed");
    run.log(
      state.t,
      "info",
      state.at,
      `trial call succeeded · circuit to ${link.to} closed`,
    );
  }
  return "continue";
}
