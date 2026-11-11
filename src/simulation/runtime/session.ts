import {
  isLiveScenario,
  liveValidationDetail,
  LiveTraceCursor,
  type LiveBackground,
  type LiveExchange,
  type LiveSpan,
} from "../live/live-exchange";
import type { RunRequest, ScenarioRun } from "../model/events";
import {
  linkLengthTiles,
  type LinkSpec,
  type SystemGraph,
} from "../model/graph";
import {
  scenarios,
  type BreakerPolicy,
  type LatencyRange,
  type ScenarioSpec,
  type Step,
} from "../scenarios/catalog";
import { checkPayload, type PayloadCheck } from "../scenarios/payloads";
import { runJobBatch, type BackgroundContext } from "./background-work";
import { CircuitBreaker } from "./circuit-breaker";
import { dedupe, dedupeLive } from "./dedupe-step";
import { guardedCall, guardedCallLive } from "./guarded-call";
import { fanout, fanoutLive } from "./fanout-step";
import { replayBackground, replayFanout } from "./live-background";
import { publish, publishLive } from "./publish-step";
import { RunBuilder } from "./run-builder";
import { SeededRng } from "./seeded-rng";
import {
  measured,
  type QueuedLiveWork,
  type RequestState,
  type ResponseDraft,
  type StepContext,
  type StepOutcome,
  type SubmitInput,
} from "./step-context";
import { TokenBucket } from "./token-bucket";

export type { SubmitInput } from "./step-context";

const BURST_SPACING_MS = 260;
/** Jobs of a batch leave the API this far apart, so they read as a stream of separate tasks. */
const BATCH_STAGGER_MS = 110;
const RATE_LIMIT = { capacity: 5, refillPerSecond: 0.8 } as const;

export interface SubmitClock {
  /** Player time the run starts at. */
  readonly playbackTime: number;
  /** Real time (ms) for time-based state: rate limiter refill and cache TTL. */
  readonly wallTime: number;
}

/**
 * Live work the request queued (a job's van at the broker, an event in the outbox); the background
 * part of the trace arrives later. `resume` compiles it onto the same run (same id), as the
 * continuation the player schedules when the page has fetched it.
 */
export interface PendingBackground {
  readonly runId: string;
  readonly traceId: string;
  /** `at` is the current playback time: the work moves on from there at the earliest. */
  resume(background: LiveBackground, at: number): ScenarioRun;
}

export interface LiveReplay {
  readonly runs: ScenarioRun[];
  readonly pending: PendingBackground[];
}

/**
 * Stateful simulation of the demo system: keeps cache entries and the rate limiter between requests,
 * and compiles each request into a deterministic timeline (same seed → same latencies and ids).
 * Steps with their own modules (publish, guarded call, dedupe) get a `StepContext`.
 */
export class SimulationSession {
  private readonly rng: SeededRng;
  private readonly links: ReadonlyMap<string, LinkSpec>;
  private readonly nodeIds: ReadonlySet<string>;
  private readonly cache = new Map<string, number>();
  private readonly limiter = new TokenBucket(
    RATE_LIMIT.capacity,
    RATE_LIMIT.refillPerSecond,
  );
  private runCount = 0;
  /** Circuit breakers by link: they remember failures between requests, like in a real service. */
  private readonly breakers = new Map<string, CircuitBreaker>();
  /** Event ids already processed (idempotent webhooks). */
  private readonly processedEvents = new Set<string>();

  constructor(
    graph: SystemGraph,
    private readonly seed = 20261103,
  ) {
    this.rng = new SeededRng(seed);
    this.links = new Map(graph.links.map((link) => [link.id, link]));
    this.nodeIds = new Set(graph.nodes.map((node) => node.id));
  }

  /** Compiles a simulated send: one run, or several for burst scenarios. */
  submit(input: SubmitInput, clock: SubmitClock): ScenarioRun[] {
    const spec = scenarios[input.scenarioId];
    return Array.from(
      { length: spec.burst },
      (_, index) =>
        this.compile(
          spec,
          input,
          clock.playbackTime + index * BURST_SPACING_MS,
          clock.wallTime,
          null,
        ).run,
    );
  }

  /**
   * Compiles live exchanges (answers of the real backend, one per request): the runs replay what
   * the service actually did instead of simulating it, and the session's own cache and rate
   * limiter are left untouched. Work the service queued comes back as `pending`.
   */
  replay(
    input: SubmitInput,
    clock: SubmitClock,
    exchanges: readonly LiveExchange[],
  ): LiveReplay {
    const spec = scenarios[input.scenarioId];
    if (!isLiveScenario(spec.id))
      throw new Error(`Scenario "${spec.id}" has no live implementation`);
    const compiled = exchanges.map((exchange, index) =>
      this.compile(
        spec,
        input,
        clock.playbackTime + index * BURST_SPACING_MS,
        clock.wallTime,
        exchange,
      ),
    );
    return {
      runs: compiled.map((item) => item.run),
      pending: compiled.flatMap((item) => (item.pending ? [item.pending] : [])),
    };
  }

  /** Forgets cache entries and refills the rate limiter. */
  reset(): void {
    this.cache.clear();
    this.limiter.reset();
    this.breakers.clear();
    this.processedEvents.clear();
  }

  linkLengthTiles(linkId: string): number {
    return linkLengthTiles(this.link(linkId));
  }

  private link(linkId: string): LinkSpec {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Scenario uses unknown link "${linkId}"`);
    return link;
  }

  private compile(
    spec: ScenarioSpec,
    input: SubmitInput,
    startAt: number,
    wallTime: number,
    live: LiveExchange | null,
  ): { readonly run: ScenarioRun; readonly pending: PendingBackground | null } {
    this.runCount += 1;
    const runId = `run-${this.runCount}`;
    const traceId = live ? live.trace.trace_id : this.hexId(16);
    const request: RunRequest = {
      method: spec.request.method,
      path: spec.request.path,
      body: spec.request.method === "POST" ? input.body : null,
      authorized: input.options.authorized,
    };
    const run = new RunBuilder(runId, traceId, spec.id, startAt, request, {
      rng: this.rng,
      linkLengthTiles: (linkId) => this.linkLengthTiles(linkId),
    });

    const firstCall = spec.steps.find((step) => step.type === "call");
    const origin = firstCall ? this.link(firstCall.link).from : "client.web";
    const state: RequestState = {
      t: startAt,
      at: origin,
      path: [],
      packetId: run.newPacket(),
      headers: { "content-type": "application/json", "x-trace-id": traceId },
      payload: null,
      skipToResponse: false,
      live: live ? new LiveTraceCursor(live) : null,
      queued: null,
    };
    const ctx: StepContext = {
      spec,
      input,
      wallTime,
      run,
      state,
      link: (linkId) => this.link(linkId),
      respond: (result) => this.respond(ctx, result),
      roundTrip: (linkId, operation, latency, note, at, span) =>
        this.roundTrip(run, linkId, operation, latency, note, at, span),
      background: () => this.background(run),
      hexId: (length) => this.hexId(length),
    };

    this.runSteps(ctx, spec.steps);
    return {
      run: run.build(),
      pending: state.queued ? this.pendingBackground(run, state.queued) : null,
    };
  }

  private pendingBackground(
    run: RunBuilder,
    work: QueuedLiveWork,
  ): PendingBackground {
    return {
      runId: run.runId,
      traceId: run.traceId,
      resume: (background, at) => {
        const startAt = Math.max(work.readyAt, at);
        if (work.kind === "job")
          replayBackground(
            this.background(run),
            work.steps,
            {
              packetId: work.packetId,
              brokerId: work.brokerId,
              taskId: work.taskId,
              startAt,
            },
            background,
          );
        else
          replayFanout(this.background(run), { ...work, startAt }, background);
        return run.build();
      },
    };
  }

  private runSteps(ctx: StepContext, steps: readonly Step[]): StepOutcome {
    for (const step of steps) {
      if (ctx.state.skipToResponse && step.type !== "respond") continue;
      if (this.runStep(ctx, step) === "responded") return "responded";
    }
    return "continue";
  }

  private runStep(ctx: StepContext, step: Step): StepOutcome {
    const { spec, state, run, input, wallTime } = ctx;
    switch (step.type) {
      case "call": {
        const link = this.link(step.link);
        state.t = run.hop(
          state.packetId,
          "request",
          "neutral",
          link.id,
          false,
          state.t,
          true,
        );
        state.at = link.to;
        state.path.push(link.id);
        if (state.path.length === 1) {
          run.log(
            state.t,
            "info",
            link.to,
            `${spec.request.method} ${spec.request.path} from ${link.from}`,
          );
        }
        return "continue";
      }

      case "gateway": {
        const rate = state.live?.take("rate_limit") ?? null;
        state.t = run.span(
          state.at,
          rate?.name ?? "rate limit check",
          state.t,
          [0.2, 0.6],
          {
            ok: rate?.ok ?? true,
            note: "gatewayRateLimit",
            onSyncPath: true,
            ...measured(rate),
          },
        );
        const allowed = state.live
          ? (rate?.ok ?? true)
          : this.limiter.take(wallTime);
        if (!allowed) {
          run.status(state.t, state.at, "failed", "429 Too Many Requests");
          run.log(
            state.t,
            "warn",
            state.at,
            state.live
              ? "rate limit exceeded: the token bucket in Redis is empty"
              : "rate limit exceeded: 5 requests per bucket, refill 0.8/s",
          );
          return ctx.respond({
            status: 429,
            statusText: "Too Many Requests",
            body: { detail: "Too Many Requests" },
            headers: { "retry-after": "2" },
          });
        }
        if (!spec.request.protected) return "continue";

        const authLink = this.link(step.authLink);
        const checkPacket = run.newPacket();
        state.t = run.hop(
          checkPacket,
          "request",
          "neutral",
          authLink.id,
          false,
          state.t,
          true,
        );
        const verification = state.live?.take("auth") ?? null;
        const authorized = state.live
          ? (verification?.ok ?? false)
          : input.options.authorized;
        state.t = run.span(
          authLink.to,
          verification?.name ?? "verify token",
          state.t,
          [2, 5],
          {
            ok: authorized,
            note: "gatewayAuth",
            onSyncPath: true,
            ...measured(verification),
          },
        );
        const tone = authorized ? "success" : "failed";
        state.t = run.hop(
          checkPacket,
          "response",
          tone,
          authLink.id,
          true,
          state.t,
          true,
        );
        if (!authorized) {
          run.status(state.t, state.at, "failed", "401 Unauthorized");
          run.log(
            state.t,
            "warn",
            authLink.to,
            state.live
              ? "no valid sandbox token in the request"
              : "missing bearer token",
          );
          return ctx.respond({
            status: 401,
            statusText: "Unauthorized",
            body: { detail: "Not authenticated" },
            headers: { "www-authenticate": "Bearer" },
          });
        }
        run.log(
          state.t,
          "info",
          authLink.to,
          state.live ? "sandbox token valid" : "token valid · sub=visitor",
        );
        return "continue";
      }

      case "validate": {
        if (!spec.request.payload)
          throw new Error(
            `Scenario "${spec.id}" validates a body but declares no payload`,
          );
        const validation = state.live?.take("validate") ?? null;
        // Live: the service answered before validating (no sandbox, rate limit): nothing to show.
        if (state.live && !validation) return "continue";
        const check: PayloadCheck = state.live
          ? validation?.ok === false
            ? {
                ok: false,
                detail: liveValidationDetail(state.live.exchange.response),
              }
            : { ok: true, value: {} }
          : checkPayload(spec.request.payload, input.body);
        state.t = run.span(
          state.at,
          validation?.name ?? "validate body",
          state.t,
          [0.6, 1.6],
          {
            ok: check.ok,
            note: "apiValidate",
            onSyncPath: true,
            ...measured(validation),
          },
        );
        if (check.ok) {
          state.payload = check.value;
          return "continue";
        }
        const [first] = check.detail;
        run.status(state.t, state.at, "failed", "422 Unprocessable");
        run.log(
          state.t,
          "warn",
          state.at,
          `validation failed: ${first ? `${first.loc.join(".")} — ${first.msg}` : "invalid body"}`,
        );
        return ctx.respond({
          status: 422,
          statusText: "Unprocessable Entity",
          body: { detail: check.detail },
          headers: {},
        });
      }

      case "work": {
        const handling = state.live?.take("handle") ?? null;
        // Live: the service answered before its handler ran (e.g. a 422 from validation rules).
        if (state.live && !handling) return "continue";
        state.t = run.span(
          state.at,
          handling?.name ?? step.operation,
          state.t,
          step.latency,
          {
            ok: handling?.ok ?? true,
            note: step.note,
            onSyncPath: true,
            ...measured(handling),
          },
        );
        // Live: the check refused the request (a webhook with a bad signature).
        if (handling && !handling.ok) {
          const verdict = handling.attributes.verdict;
          run.status(
            state.t,
            state.at,
            "failed",
            typeof verdict === "string" ? `Refused · ${verdict}` : "Refused",
          );
          state.skipToResponse = true;
        }
        return "continue";
      }

      case "query": {
        const statement = state.live?.take("db") ?? null;
        // Live: the service answered without this query (e.g. it stopped earlier).
        if (state.live && !statement) return "continue";
        state.t = this.roundTrip(
          run,
          step.link,
          statement?.name ?? step.operation,
          step.latency,
          step.note,
          state.t,
          statement,
        );
        return "continue";
      }

      case "cache":
        return this.cacheStep(ctx, step);

      case "publish":
        return state.live
          ? publishLive(ctx, step, state.live)
          : publish(ctx, step);

      case "guardedCall":
        return state.live
          ? guardedCallLive(ctx, step, state.live)
          : guardedCall(
              ctx,
              step,
              this.breaker(this.link(step.link).id, step.breaker),
            );

      case "dedupe":
        return state.live
          ? dedupeLive(ctx, step, state.live)
          : dedupe(ctx, step, this.processedEvents);

      case "fanout":
        return state.live
          ? fanoutLive(ctx, step, state.live)
          : fanout(ctx, step);

      case "jobBatch": {
        const link = this.link(step.link);
        const count = Number(state.payload?.[step.countField] ?? 1);
        const taskId = this.hexId(8);
        state.headers["x-task-id"] = taskId;
        state.t = run.span(state.at, `publish ${count} jobs`, state.t, [1, 3], {
          note: "brokerPublish",
          onSyncPath: true,
        });
        const queuedAt = Array.from({ length: count }, (_, index) =>
          run.hop(
            run.newPacket(),
            "job",
            "neutral",
            link.id,
            false,
            state.t + index * BATCH_STAGGER_MS,
            false,
          ),
        );
        run.log(
          state.t,
          "info",
          link.to,
          `${count} jobs queued in "${step.queue}"`,
        );
        runJobBatch(this.background(run), {
          brokerId: link.to,
          queuedAt,
          workers: step.workers,
          operation: step.operation,
          latency: step.latency,
          workerDown: input.options.workerDown,
          autoscaleAfterMs: step.autoscaleAfterMs,
        });
        return "continue";
      }

      case "respond":
        return ctx.respond({
          status: step.status,
          statusText: step.statusText,
          body: this.fillBody(step.body, state),
          headers: {},
        });
    }
  }

  /** Read-through cache: a hit answers right away; a miss runs `onMiss`, then stores the result. */
  private cacheStep(
    ctx: StepContext,
    step: Extract<Step, { type: "cache" }>,
  ): StepOutcome {
    const { state, run, input, wallTime } = ctx;
    const link = this.link(step.link);
    const lookup = state.live?.take("cache_get") ?? null;
    const mode = input.options.cache;
    const hit = state.live
      ? lookup?.attributes.hit === true
      : mode === "hit" ||
        (mode === "auto" && (this.cache.get(step.key) ?? 0) > wallTime);
    // Live with `Cache-Control: no-cache`: the service skipped the read, so no trip to the cache.
    if (!state.live || lookup) {
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
      state.t = run.span(
        link.to,
        lookup?.name ?? `GET ${step.key}`,
        state.t,
        [0.3, 1.2],
        {
          note: hit ? "cacheHit" : "cacheRead",
          onSyncPath: true,
          ...measured(lookup),
        },
      );
      run.status(
        state.t,
        link.to,
        hit ? "cached" : "processing",
        hit ? "Cache HIT" : "Cache MISS",
      );
      state.t = run.hop(
        packet,
        "response",
        hit ? "success" : "neutral",
        link.id,
        true,
        state.t,
        true,
      );
    }
    state.headers["x-cache"] = hit ? "HIT" : "MISS";
    if (hit) {
      state.skipToResponse = true;
      return "continue";
    }
    if (this.runSteps(ctx, step.onMiss) === "responded") return "responded";
    const write = state.live?.take("cache_set") ?? null;
    if (state.live && !write) return "continue";
    state.t = this.roundTrip(
      run,
      step.link,
      write?.name ?? `SET ${step.key} EX ${step.ttlMs / 1000}`,
      [0.3, 1],
      "cacheWrite",
      state.t,
      write,
    );
    if (!state.live) this.cache.set(step.key, wallTime + step.ttlMs);
    return "continue";
  }

  private background(run: RunBuilder): BackgroundContext {
    return {
      run,
      link: (linkId) => this.link(linkId),
      hasNode: (nodeId) => this.nodeIds.has(nodeId),
    };
  }

  private breaker(linkId: string, policy: BreakerPolicy): CircuitBreaker {
    let breaker = this.breakers.get(linkId);
    if (!breaker) {
      breaker = new CircuitBreaker(policy.failureThreshold, policy.cooldownMs);
      this.breakers.set(linkId, breaker);
    }
    return breaker;
  }

  /** Request to a dependency and its answer back; returns when the answer is home. */
  private roundTrip(
    run: RunBuilder,
    linkId: string,
    operation: string,
    latency: LatencyRange,
    note: Parameters<RunBuilder["note"]>[1],
    startAt: number,
    live: LiveSpan | null = null,
  ): number {
    const link = this.link(linkId);
    const packet = run.newPacket();
    let t = run.hop(
      packet,
      "request",
      "neutral",
      link.id,
      false,
      startAt,
      true,
    );
    t = run.span(link.to, operation, t, latency, {
      note,
      onSyncPath: true,
      ok: live?.ok ?? true,
      ...measured(live),
    });
    return run.hop(packet, "response", "success", link.id, true, t, true);
  }

  private respond(ctx: StepContext, result: ResponseDraft): StepOutcome {
    const { state, run } = ctx;
    const live = state.live?.exchange.response ?? null;
    const status = live ? live.status : result.status;
    const statusText = live ? live.statusText : result.statusText;
    const tone = status < 400 ? "success" : "failed";
    let t = state.t;
    for (const linkId of [...state.path].reverse()) {
      t = run.hop(state.packetId, "response", tone, linkId, true, t, true);
    }
    const client = state.path[0] ? this.link(state.path[0]).from : state.at;
    const latencyMs =
      Math.round(
        (state.live ? state.live.exchange.roundTripMs : run.syncLatencyMs) * 10,
      ) / 10;
    run.response(t, {
      status,
      statusText,
      headers: live ? live.headers : { ...state.headers, ...result.headers },
      body: live ? live.body : result.body,
      latencyMs,
    });
    run.status(
      t,
      client,
      tone === "success" ? "success" : "failed",
      `${status} · ${Math.round(latencyMs)} ms`,
    );
    run.note(t, "responded");
    run.log(
      t,
      tone === "success" ? "info" : "warn",
      client,
      `${status} ${statusText} · ${latencyMs} ms`,
    );
    return "responded";
  }

  private fillBody(
    template: Readonly<Record<string, unknown>>,
    state: RequestState,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      if (key === "..." && value === "$body")
        Object.assign(body, state.payload ?? {});
      else if (value === "$taskId")
        body[key] = state.headers["x-task-id"] ?? this.hexId(8);
      else if (value === "$orderId") body[key] = 1000 + this.runCount;
      else body[key] = value;
    }
    return body;
  }

  private hexId(length: number): string {
    let id = "";
    while (id.length < length)
      id += Math.floor(this.rng.next() * 16).toString(16);
    return id;
  }
}
