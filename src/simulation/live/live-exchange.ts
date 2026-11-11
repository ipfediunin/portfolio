import { z } from "zod";

import type { ScenarioId } from "../scenarios/catalog";
import type { ValidationErrorDetail } from "../scenarios/payloads";

/**
 * A request answered by the live backend (backend/services/orders-api), as the playground replays
 * it. The trace format mirrors the backend's `contracts.Trace` (backend/libs/contracts); the JSON
 * fixtures in backend/libs/contracts/fixtures are validated by both test suites.
 *
 * A request that queued work has a background part: the order worker's spans, which arrive after
 * the response. The page polls the trace until the worker is done and replays them then.
 */

export const liveSpanKinds = [
  "rate_limit",
  "auth",
  "validate",
  "handle",
  "cache_get",
  "cache_set",
  "db",
  "publish",
  "consume",
  "external",
  "retry",
  "dead_letter",
  "breaker",
  "notify",
  "push",
] as const;
export type LiveSpanKind = (typeof liveSpanKinds)[number];

/** Scenarios the live backend implements; the others stay simulations. */
export const liveScenarioIds = [
  "sync-read",
  "cache",
  "validation",
  "auth",
  "rate-limit",
  "async-job",
  "retry",
  "dead-letter",
  "circuit-breaker",
  "webhook",
  "fan-out",
] as const satisfies readonly ScenarioId[];
export type LiveScenarioId = (typeof liveScenarioIds)[number];

export const isLiveScenario = (id: ScenarioId): id is LiveScenarioId =>
  liveScenarioIds.some((liveId) => liveId === id);

const liveSpanSchema = z.object({
  kind: z.enum(liveSpanKinds),
  name: z.string().min(1).max(200),
  service: z.string().min(1).max(40),
  start_ms: z.number().nonnegative(),
  duration_ms: z.number().nonnegative(),
  ok: z.boolean(),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type LiveSpan = z.infer<typeof liveSpanSchema>;

const liveBackgroundSchema = z.object({
  state: z.enum(["pending", "done"]),
  spans: z.array(liveSpanSchema).max(64),
});
/** The workers' part of a trace: `done` once the job succeeded or was dead-lettered. */
export type LiveBackground = z.infer<typeof liveBackgroundSchema>;

export const liveTraceSchema = z.object({
  trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  method: z.enum(["GET", "POST", "DELETE"]),
  path: z.string().min(1).max(200),
  status: z.number().int().min(100).max(599),
  duration_ms: z.number().nonnegative(),
  spans: z.array(liveSpanSchema).max(64),
  background: liveBackgroundSchema.nullable().default(null),
});
export type LiveTrace = z.infer<typeof liveTraceSchema>;

export interface LiveResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface LiveExchange {
  readonly response: LiveResponse;
  readonly trace: LiveTrace;
  /** What the visitor waited, measured in the browser (network included). */
  readonly roundTripMs: number;
}

/** A recorded exchange (backend/libs/contracts/fixtures), as the tests and fixtures store it. */
export const liveExchangeSchema = z.object({
  scenario: z.string(),
  response: z.object({
    status: z.number().int(),
    statusText: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown(),
  }),
  roundTripMs: z.number().nonnegative(),
  trace: liveTraceSchema,
});

const validationDetailSchema = z.object({
  detail: z.array(
    z.object({
      loc: z.array(z.union([z.string(), z.number()])),
      msg: z.string(),
      type: z.string(),
    }),
  ),
});

/** The items of a live 422 body (FastAPI's format), or none if the body is something else. */
export function liveValidationDetail(
  response: LiveResponse,
): readonly ValidationErrorDetail[] {
  const parsed = validationDetailSchema.safeParse(response.body);
  return parsed.success ? parsed.data.detail : [];
}

/**
 * Hands out the spans of a trace by kind, in the order the service recorded them. The compiler
 * walks a scenario's steps and asks for the span each step stands for; steps the service did not
 * perform (a cache hit skips the database) simply find no span.
 */
export class LiveTraceCursor {
  private readonly queues = new Map<LiveSpanKind, LiveSpan[]>();

  constructor(readonly exchange: LiveExchange) {
    for (const span of exchange.trace.spans) {
      const queue = this.queues.get(span.kind) ?? [];
      queue.push(span);
      this.queues.set(span.kind, queue);
    }
  }

  take(kind: LiveSpanKind): LiveSpan | null {
    return this.queues.get(kind)?.shift() ?? null;
  }
}
