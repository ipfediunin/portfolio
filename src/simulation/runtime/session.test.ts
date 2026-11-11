import { describe, expect, it } from "vitest";

import { cityGraph } from "../graphs/city";
import type { HttpResult, ScenarioRun, SimEvent } from "../model/events";
import { scenarios, type ScenarioId } from "../scenarios/catalog";
import { SimulationSession, type SubmitInput } from "./session";

const clock = { playbackTime: 0, wallTime: 0 };

function input(
  scenarioId: ScenarioId,
  overrides: Partial<SubmitInput> = {},
): SubmitInput {
  const spec = scenarios[scenarioId];
  return {
    scenarioId,
    body: spec.request.sampleBody
      ? JSON.stringify(spec.request.sampleBody)
      : null,
    options: spec.defaults,
    ...overrides,
  };
}

function responseOf(run: ScenarioRun): HttpResult {
  const event = run.events.find((candidate) => candidate.type === "response");
  if (event?.type !== "response")
    throw new Error(`Run ${run.runId} has no response`);
  return event.result;
}

function eventsOf<T extends SimEvent["type"]>(
  run: ScenarioRun,
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return run.events.filter(
    (event): event is Extract<SimEvent, { type: T }> => event.type === type,
  );
}

function single(
  session: SimulationSession,
  submit: SubmitInput,
  at = clock,
): ScenarioRun {
  const [run] = session.submit(submit, at);
  if (!run) throw new Error("Expected a run");
  return run;
}

describe("SimulationSession", () => {
  it("answers a protected read with 200 after verifying the token", () => {
    const run = single(new SimulationSession(cityGraph), input("sync-read"));
    expect(responseOf(run).status).toBe(200);
    const spanNodes = eventsOf(run, "span.started").map(
      (event) => event.span.nodeId,
    );
    expect(spanNodes).toEqual(
      expect.arrayContaining([
        "gateway",
        "api.auth",
        "api.orders",
        "db.postgres",
      ]),
    );
  });

  it("rejects a request without a token at the gateway, before it reaches the service", () => {
    const run = single(new SimulationSession(cityGraph), input("auth"));
    expect(responseOf(run)).toMatchObject({
      status: 401,
      body: { detail: "Not authenticated" },
    });
    const touched = eventsOf(run, "span.started").map(
      (event) => event.span.nodeId,
    );
    expect(touched).not.toContain("api.orders");
  });

  it("misses the cache first and hits it on the second request", () => {
    const session = new SimulationSession(cityGraph);
    const first = single(session, input("cache"), {
      playbackTime: 0,
      wallTime: 0,
    });
    const second = single(session, input("cache"), {
      playbackTime: 20_000,
      wallTime: 1000,
    });
    expect(responseOf(first).headers["x-cache"]).toBe("MISS");
    expect(responseOf(second).headers["x-cache"]).toBe("HIT");
    expect(responseOf(second).latencyMs).toBeLessThan(
      responseOf(first).latencyMs,
    );
    expect(
      eventsOf(second, "span.started").map((event) => event.span.nodeId),
    ).not.toContain("db.postgres");
  });

  it("expires cache entries after their TTL", () => {
    const session = new SimulationSession(cityGraph);
    single(session, input("cache"), { playbackTime: 0, wallTime: 0 });
    const later = single(session, input("cache"), {
      playbackTime: 20_000,
      wallTime: 31_000,
    });
    expect(responseOf(later).headers["x-cache"]).toBe("MISS");
  });

  it("returns FastAPI-style 422 errors for an invalid body", () => {
    const run = single(new SimulationSession(cityGraph), input("validation"));
    const result = responseOf(run);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      detail: expect.arrayContaining([
        expect.objectContaining({
          loc: ["body", "quantity"],
          msg: "Input should be greater than or equal to 1",
          type: "greater_than_equal",
        }),
        expect.objectContaining({
          loc: ["body", "delivery"],
          msg: "Input should be 'standard' or 'express'",
          type: "literal_error",
        }),
      ]),
    });
  });

  it("reports malformed JSON and missing fields like FastAPI", () => {
    const session = new SimulationSession(cityGraph);
    const broken = single(
      session,
      input("validation", { body: "{ quantity: 1" }),
    );
    expect(responseOf(broken).body).toMatchObject({
      detail: [{ type: "json_invalid" }],
    });
    const missing = single(
      session,
      input("validation", { body: JSON.stringify({ quantity: 1 }) }),
    );
    expect(responseOf(missing).body).toMatchObject({
      detail: expect.arrayContaining([
        { loc: ["body", "product_id"], msg: "Field required", type: "missing" },
      ]),
    });
  });

  it("creates the order with 201 when the body is valid", () => {
    const body = JSON.stringify({
      product_id: "kb-7",
      quantity: 2,
      delivery: "express",
    });
    const result = responseOf(
      single(new SimulationSession(cityGraph), input("validation", { body })),
    );
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      status: "created",
      product_id: "kb-7",
      quantity: 2,
    });
  });

  it("lets five requests of a burst through and rejects the rest with 429", () => {
    const runs = new SimulationSession(cityGraph).submit(
      input("rate-limit"),
      clock,
    );
    expect(runs.map((run) => responseOf(run).status)).toEqual([
      200, 200, 200, 200, 200, 429, 429, 429,
    ]);
    expect(runs[1]!.startAt).toBeGreaterThan(runs[0]!.startAt);
  });

  it("answers 202 right away and finishes the job in the background", () => {
    const run = single(new SimulationSession(cityGraph), input("async-job"));
    const response = run.events.find((event) => event.type === "response");
    const lastJobHop = eventsOf(run, "packet.hop")
      .filter((event) => event.hop.kind === "event")
      .at(-1);
    expect(responseOf(run)).toMatchObject({
      status: 202,
      body: { status: "queued" },
    });
    expect(lastJobHop && response && lastJobHop.hop.arriveAt).toBeGreaterThan(
      response?.at ?? Infinity,
    );
    expect(
      eventsOf(run, "node.status").some(
        (event) => event.text === "ws · report.ready",
      ),
    ).toBe(true);
  });

  it("retries a failing provider with growing backoff, then succeeds", () => {
    const run = single(new SimulationSession(cityGraph), input("retry"));
    const attempts = eventsOf(run, "span.started").filter(
      (event) => event.span.nodeId === "provider.payments",
    );
    expect(attempts.map((event) => event.span.ok)).toEqual([
      false,
      false,
      true,
    ]);
    const statuses = eventsOf(run, "node.status").map((event) => event.text);
    expect(statuses).toEqual(
      expect.arrayContaining([
        "Retry in 1s",
        "Retry in 2s",
        "ws · payment.succeeded",
      ]),
    );
  });

  it("dead-letters the task after the last failed attempt and raises an alert", () => {
    const run = single(new SimulationSession(cityGraph), input("dead-letter"));
    const statuses = eventsOf(run, "node.status").map(
      (event) => `${event.nodeId}: ${event.text}`,
    );
    expect(statuses).toEqual(
      expect.arrayContaining([
        "dlq: Dead-lettered",
        "monitoring: Alert · DLQ",
        "notifications: ws · payment.failed",
      ]),
    );
    // The task was recorded before queuing; the payment itself never is.
    const statements = eventsOf(run, "span.started")
      .filter((event) => event.span.nodeId === "db.postgres")
      .map((event) => event.span.name);
    expect(statements).toEqual(["INSERT INTO tasks"]);
  });

  it("produces a coherent timeline", () => {
    const session = new SimulationSession(cityGraph);
    for (const scenarioId of Object.keys(scenarios) as ScenarioId[]) {
      for (const run of session.submit(input(scenarioId), {
        playbackTime: 1000,
        wallTime: 0,
      })) {
        const times = run.events.map((event) => event.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(run.events[0]?.type).toBe("run.started");
        expect(run.events.at(-1)?.type).toBe("run.finished");
        expect(eventsOf(run, "response")).toHaveLength(1);

        // A packet never departs before it arrived at its previous hop.
        const lastArrival = new Map<string, number>();
        for (const { hop } of eventsOf(run, "packet.hop")) {
          expect(hop.departAt).toBeGreaterThanOrEqual(
            lastArrival.get(hop.packetId) ?? run.startAt,
          );
          expect(hop.arriveAt).toBeGreaterThan(hop.departAt);
          lastArrival.set(hop.packetId, hop.arriveAt);
        }
      }
      session.reset();
    }
  });

  it("is deterministic for a seed", () => {
    const first = single(new SimulationSession(cityGraph, 7), input("retry"));
    const second = single(new SimulationSession(cityGraph, 7), input("retry"));
    expect(second).toEqual(first);
  });
});

describe("SimulationSession · resilience scenarios", () => {
  const breakerOf = (run: ScenarioRun) =>
    eventsOf(run, "node.status")
      .filter((event) => event.nodeId === "api.payments")
      .map((event) => event.text);

  it("opens the circuit after three timeouts and fails fast while open", () => {
    const session = new SimulationSession(cityGraph);
    const results = [0, 1, 2, 3].map((index) =>
      single(session, input("circuit-breaker"), {
        playbackTime: index * 10_000,
        wallTime: index * 2000,
      }),
    );
    expect(results.map((run) => responseOf(run).status)).toEqual([
      504, 504, 504, 503,
    ]);
    expect(breakerOf(results[0]!)).toContain("Failures 1/3");
    expect(breakerOf(results[2]!)).toContain("Breaker OPEN");
    // Failing fast skips the provider: no packet travels to it and it answers in milliseconds.
    const fast = results[3]!;
    expect(
      eventsOf(fast, "packet.hop").some(
        (event) => event.hop.linkId === "l.payments-provider",
      ),
    ).toBe(false);
    expect(responseOf(fast).latencyMs).toBeLessThan(
      responseOf(results[0]!).latencyMs / 10,
    );
  });

  it("closes the circuit after a successful trial once the provider is back", () => {
    const session = new SimulationSession(cityGraph);
    for (let index = 0; index < 3; index++)
      single(session, input("circuit-breaker"), {
        playbackTime: index * 10_000,
        wallTime: 0,
      });
    const recovered = {
      ...scenarios["circuit-breaker"].defaults,
      providerDown: false,
    };
    const trial = single(
      session,
      input("circuit-breaker", { options: recovered }),
      { playbackTime: 40_000, wallTime: 9000 },
    );
    expect(responseOf(trial).status).toBe(200);
    expect(breakerOf(trial)).toEqual([
      "Half-open · trial call",
      "Breaker CLOSED",
    ]);
    session.reset();
    expect(
      responseOf(
        single(session, input("circuit-breaker", { options: recovered })),
      ).status,
    ).toBe(200);
  });

  it("processes a webhook once and acknowledges the repeat without writing again", () => {
    const session = new SimulationSession(cityGraph);
    const first = single(session, input("webhook"));
    const repeat = single(session, input("webhook"), {
      playbackTime: 20_000,
      wallTime: 1000,
    });
    const writes = (run: ScenarioRun) =>
      eventsOf(run, "packet.hop").filter(
        (event) => event.hop.linkId === "l.payments-db",
      ).length;
    expect(responseOf(first)).toMatchObject({
      status: 200,
      body: { received: true },
    });
    expect(writes(first)).toBeGreaterThan(0);
    expect(responseOf(repeat)).toMatchObject({
      status: 200,
      body: { received: true, duplicate: true },
    });
    expect(writes(repeat)).toBe(0);

    const another = single(
      session,
      input("webhook", {
        body: JSON.stringify({
          id: "evt_9b21",
          type: "payment.succeeded",
          data: { order_id: 43 },
        }),
      }),
      { playbackTime: 40_000, wallTime: 2000 },
    );
    expect(responseOf(another).body).toEqual({ received: true });
  });

  it("fans one event out to three subscribers in parallel and answers 201 meanwhile", () => {
    const run = single(new SimulationSession(cityGraph), input("fan-out"));
    const deliveries = eventsOf(run, "packet.hop").filter((event) =>
      ["l.kafka-worker", "l.kafka-worker-2", "l.kafka-hub"].includes(
        event.hop.linkId,
      ),
    );
    expect(deliveries).toHaveLength(3);
    const departures = deliveries.map((event) => event.hop.departAt);
    expect(Math.max(...departures) - Math.min(...departures)).toBeLessThan(300);
    expect(responseOf(run).status).toBe(201);
    const response = eventsOf(run, "response")[0]!;
    expect(response.at).toBeLessThan(
      Math.max(...deliveries.map((event) => event.hop.arriveAt)) + 5000,
    );
  });

  it("publishes the order's event from the outbox, after the order is committed", () => {
    const run = single(new SimulationSession(cityGraph), input("fan-out"));
    const committed = eventsOf(run, "span.started").find((event) =>
      event.span.name.startsWith("INSERT INTO orders, outbox"),
    );
    if (!committed) throw new Error("No INSERT span");
    const published = eventsOf(run, "packet.hop").find(
      (event) => event.hop.linkId === "l.orders-kafka",
    );
    if (!published) throw new Error("The event never left for Kafka");
    // The relay picks the event up later; the request itself publishes nothing.
    expect(published.hop.departAt).toBeGreaterThan(committed.span.endAt);
    expect(
      eventsOf(run, "span.started").some(
        (event) =>
          event.span.nodeId === "api.orders" &&
          event.span.name.startsWith("publish"),
      ),
    ).toBe(false);
    const kafka = eventsOf(run, "span.started").find(
      (event) => event.span.nodeId === "broker.kafka",
    );
    expect(kafka?.span.name).toBe("produce orders.events (acks=all)");
  });

  it("drains a queue with both workers, or autoscales when one is down", () => {
    const jobsPerWorker = (run: ScenarioRun) => {
      const counts = { first: 0, second: 0 };
      for (const event of eventsOf(run, "packet.hop")) {
        if (event.hop.kind !== "job") continue;
        if (event.hop.linkId === "l.broker-worker") counts.first += 1;
        if (event.hop.linkId === "l.broker-worker-2") counts.second += 1;
      }
      return counts;
    };
    const healthy = { ...scenarios.chaos.defaults, workerDown: false };
    const shared = single(
      new SimulationSession(cityGraph),
      input("chaos", { options: healthy }),
    );
    expect(jobsPerWorker(shared).first + jobsPerWorker(shared).second).toBe(6);
    expect(jobsPerWorker(shared).first).toBeGreaterThan(0);

    const chaos = single(new SimulationSession(cityGraph), input("chaos"));
    const notes = eventsOf(chaos, "note").map((event) => event.key);
    expect(notes).toEqual(
      expect.arrayContaining(["chaosDown", "chaosAutoscale", "chaosDrained"]),
    );
    const autoscaledAt = eventsOf(chaos, "note").find(
      (event) => event.key === "chaosAutoscale",
    )!.at;
    // The lost worker takes nothing until its replacement is up.
    for (const event of eventsOf(chaos, "packet.hop"))
      if (event.hop.linkId === "l.broker-worker")
        expect(event.hop.departAt).toBeGreaterThan(autoscaledAt);
    expect(responseOf(chaos).status).toBe(202);

    // A short import drains before the autoscaler reacts: nothing to scale.
    const small = single(
      new SimulationSession(cityGraph),
      input("chaos", { body: JSON.stringify({ rows: 1 }) }),
    );
    const smallNotes = eventsOf(small, "note").map((event) => event.key);
    expect(smallNotes).toContain("chaosDown");
    expect(smallNotes).not.toContain("chaosAutoscale");
  });
});
