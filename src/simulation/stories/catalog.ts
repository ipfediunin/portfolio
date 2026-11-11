import type {
  LogLevel,
  NoteKey,
  PacketKind,
  PacketTone,
} from "../model/events";
import type { NodeStatus, SceneViewId } from "../model/graph";
import type { LatencyRange, ScenarioId } from "../scenarios/catalog";

/**
 * District stories: short scripted demos for the stack pages (a webhook arriving twice, a page
 * streaming in, a Docker image). Unlike playground scenarios they take no input and keep no state, so they
 * are plain timelines of steps, compiled by runtime/story-compiler.ts into the same events.
 */

export const storyIds = [
  "webhook-idempotency",
  "framework-choice",
  "ssr-streaming",
  "client-validation",
  "optimistic-ui",
  "bot-sync",
  "sync-failure",
  "docker-image",
] as const;
export type StoryId = (typeof storyIds)[number];

export type DistrictId = Extract<
  SceneViewId,
  "backend" | "frontend" | "automation"
>;

export type StoryStep =
  /** A packet travels a link; the story continues when it arrives. */
  | {
      readonly type: "hop";
      readonly link: string;
      readonly kind: PacketKind;
      readonly tone: PacketTone;
      readonly reverse: boolean;
    }
  /** Work at a node: a trace span with a realistic latency. */
  | {
      readonly type: "work";
      readonly node: string;
      readonly name: string;
      readonly latency: LatencyRange;
      readonly ok: boolean;
    }
  | {
      readonly type: "status";
      readonly node: string;
      readonly status: NodeStatus;
      readonly text: string;
    }
  | { readonly type: "note"; readonly key: NoteKey }
  | {
      readonly type: "log";
      readonly node: string;
      readonly level: LogLevel;
      readonly message: string;
    }
  | { readonly type: "pause"; readonly ms: number }
  /** Steps that start together, `stagger` ms apart; the story continues when the last one ends. */
  | {
      readonly type: "together";
      readonly stagger: number;
      readonly steps: readonly StoryStep[];
    };

export interface StorySpec {
  readonly id: StoryId;
  readonly steps: readonly StoryStep[];
}

const send = (
  link: string,
  kind: PacketKind = "request",
  tone: PacketTone = "neutral",
): StoryStep => ({ type: "hop", link, kind, tone, reverse: false });
const reply = (link: string, tone: PacketTone = "success"): StoryStep => ({
  type: "hop",
  link,
  kind: "response",
  tone,
  reverse: true,
});
const work = (
  node: string,
  name: string,
  latency: LatencyRange,
  ok = true,
): StoryStep => ({ type: "work", node, name, latency, ok });
const status = (node: string, value: NodeStatus, text: string): StoryStep => ({
  type: "status",
  node,
  status: value,
  text,
});
const note = (key: NoteKey): StoryStep => ({ type: "note", key });
const log = (node: string, level: LogLevel, message: string): StoryStep => ({
  type: "log",
  node,
  level,
  message,
});
const pause = (ms: number): StoryStep => ({ type: "pause", ms });

/** Next.js server → gateway → Orders API and back: the data a page or an action needs. */
const fetchOrders = (operation: string, tone: PacketTone = "success") => [
  send("l.next-gateway"),
  send("l.gateway-orders"),
  work("api.orders", operation, [4, 12], tone === "success"),
  reply("l.gateway-orders", tone),
  reply("l.next-gateway", tone),
];

export const stories: Readonly<Record<StoryId, StorySpec>> = {
  "webhook-idempotency": {
    id: "webhook-idempotency",
    steps: [
      note("webhookReceived"),
      send("l.provider-payments", "event"),
      work("api.payments", "verify signature", [1, 3]),
      work("api.payments", "check event id evt_8f3a", [0.4, 1.2]),
      send("l.payments-db"),
      work("db.postgres", "UPDATE payments SET status = 'paid'", [6, 14]),
      reply("l.payments-db"),
      status("api.payments", "success", "Processed · evt_8f3a"),
      log("api.payments", "info", "payment.succeeded evt_8f3a → order 42 paid"),
      reply("l.provider-payments"),
      pause(700),
      note("webhookDuplicate"),
      send("l.provider-payments", "event", "retry"),
      work("api.payments", "check event id evt_8f3a", [0.4, 1.2]),
      status("api.payments", "cached", "Duplicate · ignored"),
      log("api.payments", "warn", "evt_8f3a already processed · skipped"),
      note("webhookIgnored"),
      reply("l.provider-payments"),
    ],
  },

  "framework-choice": {
    id: "framework-choice",
    steps: [
      note("choiceIntro"),
      pause(900),
      status("api.payments", "processing", "Django · ORM + admin"),
      note("choiceDjango"),
      send("l.orders-payments"),
      work("api.payments", "Django admin · refund #314", [8, 18]),
      reply("l.orders-payments"),
      pause(900),
      status("api.orders", "success", "FastAPI · async I/O"),
      note("choiceFastapi"),
      {
        type: "together",
        stagger: 260,
        steps: [
          send("l.gateway-orders"),
          send("l.gateway-orders"),
          send("l.gateway-orders"),
          send("l.gateway-orders"),
        ],
      },
      pause(900),
      status("api.auth", "success", "Flask · small service"),
      note("choiceFlask"),
      send("l.gateway-auth"),
      work("api.auth", "verify token", [1, 3]),
      reply("l.gateway-auth"),
      pause(900),
      note("choiceSummary"),
    ],
  },

  "ssr-streaming": {
    id: "ssr-streaming",
    steps: [
      note("ssrRequest"),
      send("l.web-next"),
      work("web.next", "render shell", [8, 16]),
      reply("l.web-next"),
      status("client.web", "success", "Shell painted"),
      note("ssrShell"),
      ...fetchOrders("GET /api/orders/42"),
      note("ssrStream"),
      reply("l.web-next"),
      status("client.web", "success", "Streamed · order"),
      work("web.next", "render reviews", [12, 24]),
      reply("l.web-next"),
      status("client.web", "success", "Streamed · reviews"),
      pause(500),
      note("ssrHydrate"),
      status("client.web", "success", "Hydrated"),
    ],
  },

  "client-validation": {
    id: "client-validation",
    steps: [
      note("validateClient"),
      status("client.web", "failed", "Zod · email invalid"),
      log("client.web", "warn", "form blocked before the network: email"),
      pause(1800),
      note("validateFixed"),
      send("l.web-next"),
      work("web.next", "Server Action · createOrder", [1, 3]),
      note("validateServer"),
      ...fetchOrders("POST /api/orders"),
      reply("l.web-next"),
      status("client.web", "success", "201 · Saved"),
    ],
  },

  "optimistic-ui": {
    id: "optimistic-ui",
    steps: [
      note("optimisticClick"),
      status("client.web", "success", "Liked · optimistic"),
      send("l.web-next"),
      ...fetchOrders("PUT /api/products/7/like"),
      reply("l.web-next"),
      status("client.web", "success", "Confirmed"),
      note("optimisticConfirm"),
      pause(1200),
      note("optimisticFail"),
      status("client.web", "success", "Unliked · optimistic"),
      send("l.web-next"),
      send("l.next-gateway"),
      work("gateway", "upstream timeout", [2000, 3000], false),
      reply("l.next-gateway", "failed"),
      reply("l.web-next", "failed"),
      status("client.web", "failed", "Rolled back"),
      log("client.web", "error", "like failed: 504 · state restored"),
      note("optimisticRollback"),
    ],
  },

  "bot-sync": {
    id: "bot-sync",
    steps: [
      note("botCommand"),
      status("ops.bot", "processing", "/sync partners"),
      send("l.bot-sync", "job"),
      work("ops.parser", "fetch partner API", [2, 5]),
      send("l.parser-site"),
      reply("l.parser-site"),
      work("ops.parser", "validate 128 records", [6, 14]),
      note("syncStore"),
      send("l.parser-db", "job"),
      work("db.postgres", "UPSERT products", [12, 30]),
      status("db.postgres", "success", "Upserted 128"),
      log("ops.parser", "info", "partner sync · 128 upserted · 0 rejected"),
      reply("l.bot-sync"),
      status("ops.bot", "success", "Done · 128 records"),
      note("botDone"),
    ],
  },

  "sync-failure": {
    id: "sync-failure",
    steps: [
      note("syncStart"),
      send("l.scheduler-parser", "job"),
      work("ops.parser", "fetch partner API", [2, 5]),
      send("l.parser-site"),
      status("ext.site", "failed", "503 Unavailable"),
      reply("l.parser-site", "failed"),
      log("ops.parser", "error", "partner API 503 · sync stopped · 0 written"),
      status("ops.parser", "failed", "503 · logged"),
      note("syncFailed"),
      reply("l.bot-sync", "failed"),
      status("ops.bot", "failed", "Alert · sync failed"),
      note("syncNotified"),
    ],
  },

  "docker-image": {
    id: "docker-image",
    steps: [
      note("dockerBuild"),
      status("ops.ci", "processing", "docker build"),
      work("ops.ci", "docker build bot:1.4", [40, 90]),
      status("ops.ci", "success", "Image · bot:1.4"),
      send("l.ci-registry", "job"),
      status("ops.registry", "success", "Pushed · bot:1.4"),
      note("dockerPush"),
      send("l.registry-bot", "job"),
      work("ops.bot", "docker run bot:1.4", [20, 40]),
      status("ops.bot", "success", "Running · bot:1.4"),
      note("dockerRun"),
    ],
  },
};

/** A runnable item on a district page: one of its stories or a playground request. */
export type DistrictEntry =
  | { readonly kind: "story"; readonly id: StoryId }
  | { readonly kind: "request"; readonly id: ScenarioId };

/** What each district page offers to run, in order. */
export const districtEntries: Readonly<
  Record<DistrictId, readonly DistrictEntry[]>
> = {
  backend: [
    { kind: "request", id: "sync-read" },
    { kind: "request", id: "cache" },
    { kind: "request", id: "async-job" },
    { kind: "story", id: "webhook-idempotency" },
    { kind: "story", id: "framework-choice" },
  ],
  frontend: [
    { kind: "story", id: "ssr-streaming" },
    { kind: "story", id: "client-validation" },
    { kind: "story", id: "optimistic-ui" },
  ],
  automation: [
    { kind: "story", id: "bot-sync" },
    { kind: "story", id: "sync-failure" },
    { kind: "story", id: "docker-image" },
  ],
};
