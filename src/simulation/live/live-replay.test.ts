import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cityGraph } from "../graphs/city";
import type { ScenarioRun, SimEvent, Span } from "../model/events";
import { SimulationSession } from "../runtime/session";
import { scenarios, type ScenarioId } from "../scenarios/catalog";
import {
  isLiveScenario,
  liveExchangeSchema,
  liveScenarioIds,
  type LiveExchange,
} from "./live-exchange";

/** Exchanges recorded from the real backend (backend/libs/contracts/fixtures). */
const FIXTURES = join(__dirname, "../../../backend/libs/contracts/fixtures");

function fixtures(): ReturnType<typeof liveExchangeSchema.parse>[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      liveExchangeSchema.parse(
        JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")),
      ),
    );
}

function replay(scenarioId: ScenarioId, exchanges: readonly LiveExchange[]) {
  const spec = scenarios[scenarioId];
  return new SimulationSession(cityGraph).replay(
    {
      scenarioId,
      body: spec.request.method === "POST" ? "{}" : null,
      options: spec.defaults,
    },
    { playbackTime: 0, wallTime: 0 },
    exchanges,
  );
}

const spansOf = (run: ScenarioRun): Span[] =>
  run.events.flatMap((event) =>
    event.type === "span.started" ? [event.span] : [],
  );

const statusesOf = (run: ScenarioRun): string[] =>
  run.events.flatMap((event) =>
    event.type === "node.status" ? [`${event.nodeId}: ${event.text}`] : [],
  );

const responseOf = (run: ScenarioRun) => {
  const event = run.events.find(
    (item): item is Extract<SimEvent, { type: "response" }> =>
      item.type === "response",
  );
  if (!event) throw new Error(`Run ${run.runId} has no response`);
  return event.result;
};

function liveScenario(scenario: string): ScenarioId {
  if (!isLiveScenario(scenario as ScenarioId))
    throw new Error(`Fixture for a non-live scenario: ${scenario}`);
  return scenario as ScenarioId;
}

/** The synchronous run and, for queued work, its continuation from the workers' spans. */
function replayFully(exchange: LiveExchange) {
  const scenario = liveScenario(
    (exchange as LiveExchange & { scenario: string }).scenario,
  );
  const { runs, pending } = replay(scenario, [exchange]);
  const [run] = runs;
  if (!run) throw new Error("No run compiled");
  const background = exchange.trace.background;
  const [queued] = pending;
  const continuation =
    queued && background ? queued.resume(background, run.endAt) : null;
  return { run, pending, continuation };
}

describe("live exchanges", () => {
  const recorded = fixtures();

  it("are recorded for every live scenario", () => {
    expect(new Set(recorded.map((item) => item.scenario))).toEqual(
      new Set(liveScenarioIds),
    );
  });

  it.each(recorded.map((item) => [item.scenario, item] as const))(
    "%s replays the service's real answer, spans and latencies",
    (_, exchange) => {
      const { run } = replayFully(exchange);

      expect(run.traceId).toBe(exchange.trace.trace_id);
      const result = responseOf(run);
      expect(result.status).toBe(exchange.response.status);
      expect(result.body).toEqual(exchange.response.body);
      expect(result.latencyMs).toBe(Math.round(exchange.roundTripMs * 10) / 10);

      // Every span the service recorded shows up with its measured latency, in order.
      const replayed = spansOf(run);
      const measured = exchange.trace.spans.filter((span) =>
        replayed.some((item) => item.name === span.name),
      );
      expect(measured.map((span) => span.duration_ms)).toEqual(
        replayed
          .filter((item) => measured.some((span) => span.name === item.name))
          .map((item) => item.reportedMs),
      );
      expect(replayed.every((span) => span.reportedMs >= 0)).toBe(true);
    },
  );

  const queued = recorded.filter((item) => item.trace.background !== null);
  // Jobs: one worker after another, so the replay keeps the trace's order exactly.
  const jobs = queued.filter((item) => item.scenario !== "fan-out");

  it("include queued work for the async scenarios and the order's events", () => {
    expect(queued.map((item) => item.scenario).sort()).toEqual([
      "async-job",
      "dead-letter",
      "fan-out",
      "retry",
    ]);
  });

  it.each(jobs.map((item) => [item.scenario, item] as const))(
    "%s continues the same run with every span the worker recorded",
    (_, exchange) => {
      const { run, pending, continuation } = replayFully(exchange);
      expect(pending).toHaveLength(1);
      if (!continuation) throw new Error("No continuation compiled");

      expect(continuation.runId).toBe(run.runId);
      expect(continuation.events[0]?.at).toBeGreaterThanOrEqual(run.endAt);
      expect(
        continuation.events.some((event) => event.type === "run.started"),
      ).toBe(false);
      const background = exchange.trace.background?.spans ?? [];
      expect(
        spansOf(continuation).map((span) => [span.name, span.reportedMs]),
      ).toEqual(background.map((span) => [span.name, span.duration_ms]));
    },
  );

  it("replays retries with the worker's real backoff, then success", () => {
    const exchange = queued.find((item) => item.scenario === "retry");
    if (!exchange) throw new Error("No retry fixture");
    const { continuation } = replayFully(exchange);
    if (!continuation) throw new Error("No continuation compiled");
    const calls = spansOf(continuation).filter(
      (span) => span.nodeId === "provider.payments",
    );
    expect(calls.map((span) => span.ok)).toEqual([false, false, true]);
    expect(statusesOf(continuation)).toEqual(
      expect.arrayContaining([
        "worker.celery: Retry in 1s",
        "worker.celery: Retry in 2s",
        "provider.payments: 503 Unavailable",
        "provider.payments: 201 Created",
        "worker.celery: Done",
      ]),
    );
  });

  it("replays a dead-lettered job without inventing an alert", () => {
    const exchange = queued.find((item) => item.scenario === "dead-letter");
    if (!exchange) throw new Error("No dead-letter fixture");
    const { continuation } = replayFully(exchange);
    if (!continuation) throw new Error("No continuation compiled");
    const statuses = statusesOf(continuation);
    expect(statuses).toContain("dlq: Dead-lettered");
    expect(statuses.some((status) => status.startsWith("monitoring:"))).toBe(
      false,
    );
    expect(statuses).not.toContain("worker.celery: Done");
    // The failure reached the page: the hub recorded its push.
    expect(statuses).toContain("notifications: ws · payment.failed");
  });

  it("draws the push to the page only when the hub recorded one", () => {
    const exchange = queued.find((item) => item.scenario === "async-job");
    if (!exchange?.trace.background) throw new Error("No async-job fixture");
    const pushed = replayFully(exchange).continuation;
    if (!pushed) throw new Error("No continuation compiled");
    expect(hopsOn(pushed, "l.worker-hub")).toHaveLength(1);
    expect(hopsOn(pushed, "l.hub-web")).toHaveLength(1);
    expect(statusesOf(pushed)).toContain("notifications: ws · report.ready");
    expect(notesOf(pushed)).toContain("push");

    // The same job with the page's socket closed: filed and published, pushed to nobody.
    const unheard = replayFully({
      ...exchange,
      trace: {
        ...exchange.trace,
        background: {
          ...exchange.trace.background,
          spans: exchange.trace.background.spans.filter(
            (span) => span.kind !== "push",
          ),
        },
      },
    }).continuation;
    if (!unheard) throw new Error("No continuation compiled");
    expect(hopsOn(unheard, "l.hub-web")).toHaveLength(0);
    expect(statusesOf(unheard)).toContain(
      "notifications: report.ready · no socket",
    );
  });

  it("parks the job at the broker while the worker is still at it", () => {
    const exchange = queued.find((item) => item.scenario === "retry");
    if (!exchange) throw new Error("No retry fixture");
    const { run, pending } = replayFully(exchange);
    const [job] = pending;
    if (!job) throw new Error("No pending job");
    const partial = job.resume(
      {
        state: "pending",
        spans: (exchange.trace.background?.spans ?? []).slice(0, 3),
      },
      run.endAt + 5000,
    );
    expect(partial.events[0]?.at).toBeGreaterThanOrEqual(run.endAt + 5000);
    expect(statusesOf(partial)).toContain("broker.rabbit: No result yet");
  });

  const named = (scenario: string) => {
    const found = recorded.find((item) => item.scenario === scenario);
    if (!found) throw new Error(`No ${scenario} fixture`);
    return found;
  };
  const notesOf = (run: ScenarioRun): string[] =>
    run.events.flatMap((event) => (event.type === "note" ? [event.key] : []));

  it("replays a provider timeout behind the Payments API's breaker", () => {
    const { run } = replayFully(named("circuit-breaker"));
    const calls = spansOf(run).filter(
      (span) => span.nodeId === "provider.payments",
    );
    expect(calls.map((span) => span.ok)).toEqual([false]);
    const statuses = statusesOf(run);
    expect(statuses).toContain("api.payments: Failures 1/3");
    expect(
      statuses.some((status) =>
        status.startsWith("provider.payments: Timeout"),
      ),
    ).toBe(true);
    expect(responseOf(run).status).toBe(504);
  });

  it("opens the breaker on the third timeout", () => {
    const timeout = named("circuit-breaker");
    const spans = timeout.trace.spans.map((span, index, all) =>
      index === all.length - 1
        ? { ...span, attributes: { state: "open", failures: 3 } }
        : span,
    );
    const { run } = replayFully({
      ...timeout,
      trace: { ...timeout.trace, spans },
    });
    expect(statusesOf(run)).toContain("api.payments: Breaker OPEN");
    expect(notesOf(run)).toContain("breakerTripped");
  });

  it("fails fast without calling the provider while the breaker is open", () => {
    const timeout = named("circuit-breaker");
    const [rate, handle, permission] = timeout.trace.spans;
    if (!rate || !handle || !permission) throw new Error("Unexpected trace");
    const { run } = replayFully({
      ...timeout,
      response: {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "retry-after": "8" },
        body: { detail: "Payment provider is unavailable, try again later" },
      },
      trace: {
        ...timeout.trace,
        status: 503,
        spans: [
          rate,
          handle,
          {
            ...permission,
            ok: false,
            attributes: { state: "open", failures: 3 },
          },
        ],
      },
    });
    expect(
      spansOf(run).some((span) => span.nodeId === "provider.payments"),
    ).toBe(false);
    expect(statusesOf(run)).toContain("api.payments: Breaker OPEN · fail fast");
    expect(notesOf(run)).toContain("breakerOpen");
    expect(responseOf(run).status).toBe(503);
  });

  it("replays a signed webhook: signature, event record, then the payment", () => {
    const { run } = replayFully(named("webhook"));
    const names = spansOf(run).map((span) => span.name);
    expect(names).toContain("verify HMAC-SHA256 signature");
    const statements = spansOf(run).filter(
      (span) => span.nodeId === "db.postgres",
    );
    expect(statements.map((span) => span.name.split("(")[0]?.trim())).toEqual([
      "INSERT INTO backoffice.webhook_events",
      "INSERT INTO backoffice.payments AS p",
    ]);
    expect(responseOf(run).status).toBe(200);
  });

  it("leaves the payment alone for a repeated event", () => {
    const first = named("webhook");
    const spans = first.trace.spans.slice(0, -1);
    const { run } = replayFully({
      ...first,
      response: {
        ...first.response,
        headers: { ...first.response.headers, "x-idempotent-replay": "true" },
        body: { received: true, duplicate: true },
      },
      trace: { ...first.trace, spans },
    });
    expect(statusesOf(run)).toContain("api.payments: Duplicate · ignored");
    expect(
      spansOf(run).some((span) =>
        span.name.startsWith("INSERT INTO backoffice.payments"),
      ),
    ).toBe(false);
    expect(notesOf(run)).toContain("webhookIgnored");
  });

  it("stops at a forged signature", () => {
    const first = named("webhook");
    const spans = first.trace.spans
      .filter((span) => span.kind !== "db")
      .map((span) =>
        span.kind === "handle"
          ? { ...span, ok: false, attributes: { verdict: "mismatch" } }
          : span,
      );
    const { run } = replayFully({
      ...first,
      response: {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        body: { detail: "Invalid webhook signature (mismatch)" },
      },
      trace: { ...first.trace, status: 400, spans },
    });
    expect(statusesOf(run)).toContain("api.payments: Refused · mismatch");
    expect(spansOf(run).some((span) => span.nodeId === "db.postgres")).toBe(
      false,
    );
    expect(responseOf(run).status).toBe(400);
  });

  const hopsOn = (run: ScenarioRun, linkId: string) =>
    run.events.filter(
      (event) => event.type === "packet.hop" && event.hop.linkId === linkId,
    );

  it("answers an order at once and leaves its event in the outbox", () => {
    const { run, pending } = replayFully(named("fan-out"));
    expect(responseOf(run).status).toBe(201);
    expect(pending).toHaveLength(1);
    expect(notesOf(run)).toContain("fanoutPublish");
    expect(statusesOf(run)).toContain("api.orders: Outbox · order.created");
    // The request publishes nothing itself: the relay does, after the answer.
    expect(hopsOn(run, "l.orders-kafka")).toHaveLength(0);
  });

  it("replays the relay's publish, then every consumer group along its own link", () => {
    const exchange = named("fan-out");
    const { run, continuation } = replayFully(exchange);
    if (!continuation) throw new Error("No continuation compiled");
    expect(continuation.runId).toBe(run.runId);
    expect(continuation.events[0]?.at).toBeGreaterThanOrEqual(run.endAt);

    // Every span the relay and the groups recorded, with its measured latency.
    const background = exchange.trace.background?.spans ?? [];
    const pairs = (items: readonly (readonly [string, number])[]) =>
      [...items].sort(([a, x], [b, y]) => a.localeCompare(b) || x - y);
    expect(
      pairs(spansOf(continuation).map((span) => [span.name, span.reportedMs])),
    ).toEqual(pairs(background.map((span) => [span.name, span.duration_ms])));

    expect(hopsOn(continuation, "l.orders-kafka")).toHaveLength(1);
    for (const linkId of ["l.kafka-worker", "l.kafka-worker-2", "l.kafka-hub"])
      expect(hopsOn(continuation, linkId)).toHaveLength(1);
    const statuses = statusesOf(continuation);
    for (const label of [
      "inventory · reserved",
      "analytics · counted",
      "notification · queued",
    ])
      expect(statuses.some((status) => status.endsWith(label))).toBe(true);
    expect(notesOf(continuation)).toContain("fanoutDeliver");
    expect(statuses).toContain("api.orders: Outbox · published");
    // The notifications group's message reached the page over its socket.
    expect(hopsOn(continuation, "l.hub-web")).toHaveLength(1);
    expect(statuses).toContain("notifications: ws · order.created");
  });

  it("keeps the event in the outbox while the relay has not published it", () => {
    const { run, pending } = replayFully(named("fan-out"));
    const [events] = pending;
    if (!events) throw new Error("No pending event");
    const waiting = events.resume({ state: "pending", spans: [] }, run.endAt);
    expect(statusesOf(waiting)).toContain(
      "api.orders: Outbox · order.created waiting",
    );
    expect(hopsOn(waiting, "l.orders-kafka")).toHaveLength(0);
  });

  it("shows only the groups that have read the event so far", () => {
    const exchange = named("fan-out");
    const { run, pending } = replayFully(exchange);
    const [events] = pending;
    if (!events) throw new Error("No pending event");
    const spans = (exchange.trace.background?.spans ?? []).filter(
      (span) =>
        span.kind === "publish" || span.attributes.group === "inventory",
    );
    const partial = events.resume({ state: "pending", spans }, run.endAt);
    expect(hopsOn(partial, "l.kafka-worker")).toHaveLength(1);
    expect(hopsOn(partial, "l.kafka-hub")).toHaveLength(0);
    expect(statusesOf(partial)).toContain("broker.kafka: Groups still reading");
  });

  it("leaves the session's simulated cache and rate limiter untouched", () => {
    const session = new SimulationSession(cityGraph);
    const limited = recorded.find((item) => item.response.status === 429);
    if (!limited) throw new Error("No rate-limited fixture");
    for (let index = 0; index < 3; index += 1)
      session.replay(
        {
          scenarioId: "rate-limit",
          body: null,
          options: scenarios["rate-limit"].defaults,
        },
        { playbackTime: 0, wallTime: 0 },
        [limited],
      );
    // The simulation still has its full bucket: the first simulated request goes through.
    const [simulated] = session.submit(
      { scenarioId: "cache", body: null, options: scenarios.cache.defaults },
      { playbackTime: 0, wallTime: 0 },
    );
    if (!simulated) throw new Error("No run compiled");
    expect(responseOf(simulated).status).toBe(200);
  });

  it("refuses scenarios the live backend does not implement", () => {
    const [any] = recorded;
    if (!any) throw new Error("No fixtures");
    expect(() => replay("chaos", [any])).toThrow(/no live implementation/);
  });
});
