import type { NodeStatus } from "./graph";

/**
 * Event protocol of a simulated (and, later, live) request. Time is "playback time" in ms:
 * the animation is slowed down for readability, while `reportedMs` values carry realistic latencies.
 */

export type PacketKind = "request" | "response" | "job" | "event";
/** Colors a packet by what it carries: an answer can be good or bad news, a job can be a retry. */
export type PacketTone = "neutral" | "success" | "failed" | "retry";

export interface PacketHop {
  readonly packetId: string;
  readonly runId: string;
  readonly kind: PacketKind;
  readonly tone: PacketTone;
  readonly linkId: string;
  /** Travels from the link's target back to its source. */
  readonly reverse: boolean;
  readonly departAt: number;
  readonly arriveAt: number;
}

export interface Span {
  readonly id: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly name: string;
  readonly startAt: number;
  readonly endAt: number;
  /** Realistic latency shown to the visitor (the animation itself is slowed down). */
  readonly reportedMs: number;
  readonly ok: boolean;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  readonly at: number;
  readonly runId: string;
  readonly traceId: string;
  readonly level: LogLevel;
  readonly nodeId: string;
  readonly message: string;
}

export interface HttpResult {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** Sum of reported latencies on the synchronous path. */
  readonly latencyMs: number;
}

/** Explanations shown step by step; texts live in the dictionaries, keyed by these ids. */
export const noteKeys = [
  "gatewayRateLimit",
  "gatewayAuth",
  "apiValidate",
  "apiHandle",
  "cacheRead",
  "cacheHit",
  "cacheWrite",
  "dbQuery",
  "brokerPublish",
  "workerProcess",
  "providerCall",
  "workerRetry",
  "deadLetter",
  "push",
  "responded",
  // District stories (see simulation/stories).
  "webhookReceived",
  "webhookDuplicate",
  "webhookIgnored",
  "choiceIntro",
  "choiceDjango",
  "choiceFastapi",
  "choiceFlask",
  "choiceSummary",
  "ssrRequest",
  "ssrShell",
  "ssrStream",
  "ssrHydrate",
  "validateClient",
  "validateFixed",
  "validateServer",
  "optimisticClick",
  "optimisticConfirm",
  "optimisticFail",
  "optimisticRollback",
  "botCommand",
  "syncStore",
  "botDone",
  "syncStart",
  "syncFailed",
  "syncNotified",
  "dockerBuild",
  "dockerPush",
  "dockerRun",
  // Playground scenarios 9–12.
  "breakerTimeout",
  "breakerTripped",
  "breakerOpen",
  "breakerHalfOpen",
  "breakerClosed",
  "webhookFirst",
  "fanoutPublish",
  "fanoutDeliver",
  "chaosShared",
  "chaosDown",
  "chaosAutoscale",
  "chaosDrained",
] as const;
export type NoteKey = (typeof noteKeys)[number];

export interface RunRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body: string | null;
  readonly authorized: boolean;
}

export type SimEvent =
  | {
      readonly type: "run.started";
      readonly at: number;
      readonly runId: string;
      readonly traceId: string;
      readonly scenarioId: string;
      /** The HTTP request that started the run; absent for stories that are not requests (a Docker build). */
      readonly request?: RunRequest;
    }
  | {
      readonly type: "packet.hop";
      readonly at: number;
      readonly hop: PacketHop;
    }
  | {
      readonly type: "node.status";
      readonly at: number;
      readonly runId: string;
      readonly nodeId: string;
      readonly status: NodeStatus;
      readonly text: string;
    }
  | { readonly type: "span.started"; readonly at: number; readonly span: Span }
  | { readonly type: "span.finished"; readonly at: number; readonly span: Span }
  | { readonly type: "log"; readonly at: number; readonly entry: LogEntry }
  | {
      readonly type: "note";
      readonly at: number;
      readonly runId: string;
      readonly key: NoteKey;
    }
  | {
      readonly type: "response";
      readonly at: number;
      readonly runId: string;
      readonly result: HttpResult;
    }
  | {
      readonly type: "run.finished";
      readonly at: number;
      readonly runId: string;
    };

export type SimEventType = SimEvent["type"];

/** One compiled request: every event it will produce, in time order. */
export interface ScenarioRun {
  readonly runId: string;
  readonly traceId: string;
  readonly scenarioId: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly events: readonly SimEvent[];
}
