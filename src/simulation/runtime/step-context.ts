import type { LiveSpan, LiveTraceCursor } from "../live/live-exchange";
import type { HttpResult, NoteKey } from "../model/events";
import type { LinkSpec } from "../model/graph";
import type {
  FanoutConsumer,
  JobStep,
  LatencyRange,
  ScenarioId,
  ScenarioOptions,
  ScenarioSpec,
} from "../scenarios/catalog";
import type { BackgroundContext } from "./background-work";
import type { RunBuilder } from "./run-builder";

/**
 * What a step of a request needs while the session compiles it. The session builds one context per
 * request; step handlers in their own modules (publish, guarded call, dedupe) use it instead of
 * reaching into the session.
 */

export interface SubmitInput {
  readonly scenarioId: ScenarioId;
  /** Raw JSON from the editor; ignored by scenarios without a body. */
  readonly body: string | null;
  readonly options: ScenarioOptions;
}

/** Live work the request queued, replayed when the background part of the trace is in. */
export type QueuedLiveWork =
  | {
      /** A job on a RabbitMQ queue, for a worker. */
      readonly kind: "job";
      readonly packetId: string;
      readonly brokerId: string;
      readonly taskId: string;
      /** Playback time the van has waited at the broker long enough to be picked up. */
      readonly readyAt: number;
      readonly steps: readonly JobStep[];
    }
  | {
      /** An event in the outbox, for the relay and the consumer groups. */
      readonly kind: "fanout";
      /** The node whose outbox holds the event. */
      readonly origin: string;
      /** Service → event log link the relay publishes along. */
      readonly link: string;
      readonly event: string;
      readonly consumers: readonly FanoutConsumer[];
      /** Playback time the relay picks the event up at the earliest. */
      readonly readyAt: number;
    };

export interface RequestState {
  t: number;
  at: string;
  /** Links the client request travelled, so the response can come back the same way. */
  readonly path: string[];
  readonly packetId: string;
  readonly headers: Record<string, string>;
  payload: Record<string, unknown> | null;
  skipToResponse: boolean;
  /** Live mode: the service's trace decides every step and supplies the measured latencies. */
  readonly live: LiveTraceCursor | null;
  /** Live mode: the work the service queued (a job, or an event in its outbox). */
  queued: QueuedLiveWork | null;
}

export type StepOutcome = "continue" | "responded";

/** The answer a step gives; in live mode `respond` replaces it with the service's real one. */
export type ResponseDraft = Omit<HttpResult, "latencyMs" | "headers"> & {
  readonly headers: Record<string, string>;
};

export interface StepContext {
  readonly spec: ScenarioSpec;
  readonly input: SubmitInput;
  /** Real time (ms) for time-based state: rate limiter, cache TTL, circuit breakers. */
  readonly wallTime: number;
  readonly run: RunBuilder;
  readonly state: RequestState;
  link(linkId: string): LinkSpec;
  respond(result: ResponseDraft): StepOutcome;
  /** A request to a dependency and its answer back; returns when the answer is home. */
  roundTrip(
    linkId: string,
    operation: string,
    latency: LatencyRange,
    note: NoteKey,
    startAt: number,
    live?: LiveSpan | null,
  ): number;
  background(): BackgroundContext;
  hexId(length: number): string;
}

/** A measured span's latency, for `RunBuilder.span` (nothing in simulation mode). */
export function measured(span: LiveSpan | null): {
  readonly reportedMs?: number;
} {
  return span ? { reportedMs: span.duration_ms } : {};
}
