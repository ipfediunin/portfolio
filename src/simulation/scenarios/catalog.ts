import type { NoteKey } from "../model/events";
import type { PayloadSchemaId } from "./payloads";

/**
 * Playground scenarios as data. The compiler (runtime/session.ts) executes the steps against the
 * session state (cache, rate limiter) and the visitor's input, producing a timeline of events.
 */

export const scenarioIds = [
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
  "chaos",
] as const;
export type ScenarioId = (typeof scenarioIds)[number];

/** [min, max] realistic latency in ms. */
export type LatencyRange = readonly [number, number];

export type CacheMode = "auto" | "hit" | "miss";

export interface ScenarioOptions {
  /** Sends a bearer token. */
  readonly authorized: boolean;
  readonly cache: CacheMode;
  /** How many times the external provider fails before succeeding. */
  readonly providerFailures: number;
  /** The external provider does not answer at all (circuit breaker scenario). */
  readonly providerDown: boolean;
  /** Chaos: one worker is down when the jobs arrive. */
  readonly workerDown: boolean;
}

export type ScenarioControl =
  "body" | "auth" | "cache" | "failures" | "provider" | "worker";

export interface BreakerPolicy {
  /** Failures in a row that open the circuit. */
  readonly failureThreshold: number;
  /** Wall-time ms the circuit stays open before a trial call. */
  readonly cooldownMs: number;
  /** Realistic ms the caller waits for an answer before giving up. */
  readonly timeoutMs: number;
}

/** One subscriber of a fanned-out event: a consumer group reading the topic on its own. */
export interface FanoutConsumer {
  /** The consumer group (live mode matches the worker's spans to the subscriber by it). */
  readonly group: string;
  /** Log → consumer link. */
  readonly link: string;
  /** What the subscriber does with the event, shown on its card ("inventory · reserved"). */
  readonly label: string;
  readonly operation: string;
  readonly latency: LatencyRange;
  /** Hub → page link, when the group's work ends in a push to the page over WebSocket. */
  readonly push?: string;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Realistic backoff before the second attempt; doubles after that. */
  readonly baseDelayMs: number;
}

/** Background part of a request, started by `publish`. */
export type JobStep =
  | {
      readonly type: "consume";
      readonly link: string;
      readonly operation: string;
      readonly latency: LatencyRange;
      readonly retry: RetryPolicy;
      /** Requeue / dead-letter path for failed attempts. */
      readonly deadLetterLink: string;
      readonly external?: {
        readonly link: string;
        readonly operation: string;
        readonly latency: LatencyRange;
      };
    }
  | {
      readonly type: "persist";
      readonly link: string;
      readonly operation: string;
      readonly latency: LatencyRange;
    }
  | {
      readonly type: "emit";
      /** Worker → hub, hub → client. */
      readonly links: readonly string[];
      readonly successEvent: string;
      readonly failureEvent: string;
    };

export type Step =
  /** The client request moves one link forward; the response will come back the same way. */
  | { readonly type: "call"; readonly link: string }
  /** Rate limit, then (for protected routes) token verification against the auth service. */
  | { readonly type: "gateway"; readonly authLink: string }
  | { readonly type: "validate" }
  | {
      readonly type: "work";
      readonly operation: string;
      readonly latency: LatencyRange;
      readonly note: NoteKey;
    }
  /** Round trip to a dependency and back to the current node. */
  | {
      readonly type: "query";
      readonly link: string;
      readonly operation: string;
      readonly latency: LatencyRange;
      readonly note: NoteKey;
    }
  /** Read-through cache: a hit answers right away; a miss runs `onMiss`, then stores the result. */
  | {
      readonly type: "cache";
      readonly link: string;
      readonly key: string;
      readonly ttlMs: number;
      readonly onMiss: readonly Step[];
    }
  /**
   * Call to an external dependency behind a circuit breaker (kept per link in the session). A call
   * that times out answers 504; an open circuit answers 503 right away.
   */
  | {
      readonly type: "guardedCall";
      readonly link: string;
      readonly operation: string;
      readonly latency: LatencyRange;
      readonly breaker: BreakerPolicy;
    }
  /**
   * Idempotency: a payload field (an event id) seen before skips straight to the response. `link`
   * is where the record of handled events lives (live mode replays the round trip to it).
   */
  | { readonly type: "dedupe"; readonly field: string; readonly link?: string }
  /**
   * Publishes one event to the log (a transactional outbox: it is stored with the data and relayed
   * afterwards); every consumer group reads it independently and in parallel.
   */
  | {
      readonly type: "fanout";
      readonly link: string;
      readonly event: string;
      readonly consumers: readonly FanoutConsumer[];
    }
  /**
   * Publishes one job per item (the count comes from a payload field) and lets the workers drain the
   * queue; with a worker down, an autoscaler brings a replacement after `autoscaleAfterMs`.
   */
  | {
      readonly type: "jobBatch";
      readonly link: string;
      readonly queue: string;
      readonly countField: string;
      readonly operation: string;
      readonly latency: LatencyRange;
      /** Broker → worker links; the first worker is the one chaos takes down. */
      readonly workers: readonly string[];
      readonly autoscaleAfterMs: number;
    }
  /** Hands work to the broker; the job continues in the background while the request goes on. */
  | {
      readonly type: "publish";
      readonly link: string;
      readonly queue: string;
      readonly job: readonly JobStep[];
    }
  | {
      readonly type: "respond";
      readonly status: number;
      readonly statusText: string;
      /** "$taskId" and "$orderId" placeholders are filled in by the compiler; "$body" spreads the validated payload. */
      readonly body: Readonly<Record<string, unknown>>;
    };

export interface ScenarioSpec {
  readonly id: ScenarioId;
  readonly request: {
    readonly method: "GET" | "POST";
    readonly path: string;
    /** Requires a bearer token, checked by the auth service. */
    readonly protected: boolean;
    readonly payload?: PayloadSchemaId;
    /** Pre-filled editor content for POST scenarios. */
    readonly sampleBody?: Readonly<Record<string, unknown>>;
  };
  readonly defaults: ScenarioOptions;
  readonly controls: readonly ScenarioControl[];
  /** Requests fired per send (the rate limit demo sends a burst). */
  readonly burst: number;
  readonly steps: readonly Step[];
}

const baseOptions: ScenarioOptions = {
  authorized: true,
  cache: "auto",
  providerFailures: 0,
  providerDown: false,
  workerDown: false,
};

const toOrders = [
  { type: "call", link: "l.web-gateway" },
  { type: "gateway", authLink: "l.gateway-auth" },
  { type: "call", link: "l.gateway-orders" },
] as const satisfies readonly Step[];

const readOrderFromDb = {
  type: "query",
  link: "l.orders-db",
  operation: "SELECT orders WHERE id = 42",
  latency: [14, 32],
  note: "dbQuery",
} as const satisfies Step;

/** The task is recorded before its job is queued, so its status can always be looked up. */
const recordTask = {
  type: "query",
  link: "l.orders-db",
  operation: "INSERT INTO tasks",
  latency: [4, 10],
  note: "dbQuery",
} as const satisfies Step;

const paymentJob = (retry: RetryPolicy): readonly JobStep[] => [
  {
    type: "consume",
    link: "l.broker-worker",
    operation: "charge_payment",
    latency: [40, 90],
    retry,
    deadLetterLink: "l.broker-dlq",
    external: {
      link: "l.worker-provider",
      operation: "POST /v1/charges",
      latency: [120, 260],
    },
  },
  {
    type: "persist",
    link: "l.worker-db",
    operation: "UPDATE orders SET status = 'paid'",
    latency: [10, 24],
  },
  {
    type: "emit",
    links: ["l.worker-hub", "l.hub-web"],
    successEvent: "payment.succeeded",
    failureEvent: "payment.failed",
  },
];

const paymentSteps = (retry: RetryPolicy): readonly Step[] => [
  ...toOrders,
  { type: "validate" },
  {
    type: "work",
    operation: "create_charge_task",
    latency: [3, 6],
    note: "apiHandle",
  },
  recordTask,
  {
    type: "publish",
    link: "l.orders-broker",
    queue: "payments",
    job: paymentJob(retry),
  },
  {
    type: "respond",
    status: 202,
    statusText: "Accepted",
    body: { task_id: "$taskId", status: "queued" },
  },
];

const paymentRequest = {
  method: "POST",
  path: "/api/orders/42/pay",
  protected: true,
  payload: "payment",
  sampleBody: { order_id: 42, amount: 129.9, currency: "EUR" },
} as const;

export const scenarios: Readonly<Record<ScenarioId, ScenarioSpec>> = {
  "sync-read": {
    id: "sync-read",
    request: { method: "GET", path: "/api/orders/42", protected: true },
    defaults: baseOptions,
    controls: ["auth"],
    burst: 1,
    steps: [
      ...toOrders,
      {
        type: "work",
        operation: "GET /api/orders/{id}",
        latency: [3, 7],
        note: "apiHandle",
      },
      readOrderFromDb,
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: { id: 42, status: "paid", total: 129.9, currency: "EUR" },
      },
    ],
  },

  cache: {
    id: "cache",
    request: { method: "GET", path: "/api/products/7", protected: false },
    defaults: baseOptions,
    controls: ["cache"],
    burst: 1,
    steps: [
      ...toOrders,
      {
        type: "work",
        operation: "GET /api/products/{id}",
        latency: [2, 5],
        note: "apiHandle",
      },
      {
        type: "cache",
        link: "l.orders-cache",
        key: "product:7",
        ttlMs: 30_000,
        onMiss: [
          {
            type: "query",
            link: "l.orders-db",
            operation: "SELECT products WHERE id = 7",
            latency: [22, 44],
            note: "dbQuery",
          },
        ],
      },
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: {
          id: 7,
          name: "Mechanical keyboard",
          price: 89,
          currency: "EUR",
        },
      },
    ],
  },

  validation: {
    id: "validation",
    request: {
      method: "POST",
      path: "/api/orders",
      protected: false,
      payload: "order",
      sampleBody: { product_id: "kb-7", quantity: 0, delivery: "rocket" },
    },
    defaults: baseOptions,
    controls: ["body"],
    burst: 1,
    steps: [
      ...toOrders,
      { type: "validate" },
      {
        type: "work",
        operation: "POST /api/orders",
        latency: [3, 6],
        note: "apiHandle",
      },
      {
        type: "query",
        link: "l.orders-db",
        operation: "INSERT INTO orders",
        latency: [12, 26],
        note: "dbQuery",
      },
      {
        type: "respond",
        status: 201,
        statusText: "Created",
        body: { id: "$orderId", status: "created", "...": "$body" },
      },
    ],
  },

  auth: {
    id: "auth",
    request: { method: "GET", path: "/api/orders", protected: true },
    defaults: { ...baseOptions, authorized: false },
    controls: ["auth"],
    burst: 1,
    steps: [
      ...toOrders,
      {
        type: "work",
        operation: "GET /api/orders",
        latency: [3, 6],
        note: "apiHandle",
      },
      { ...readOrderFromDb, operation: "SELECT orders LIMIT 20" },
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: { items: [{ id: 42, status: "paid" }], total: 1 },
      },
    ],
  },

  "rate-limit": {
    id: "rate-limit",
    request: { method: "GET", path: "/api/products/7", protected: false },
    defaults: { ...baseOptions, cache: "hit" },
    controls: [],
    burst: 8,
    steps: [
      ...toOrders,
      {
        type: "cache",
        link: "l.orders-cache",
        key: "product:7",
        ttlMs: 30_000,
        onMiss: [readOrderFromDb],
      },
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: { id: 7, name: "Mechanical keyboard", price: 89 },
      },
    ],
  },

  "async-job": {
    id: "async-job",
    request: {
      method: "POST",
      path: "/api/reports",
      protected: false,
      payload: "report",
      sampleBody: { period: "2026-10" },
    },
    defaults: baseOptions,
    controls: ["body"],
    burst: 1,
    steps: [
      ...toOrders,
      { type: "validate" },
      {
        type: "work",
        operation: "create_report_task",
        latency: [3, 6],
        note: "apiHandle",
      },
      recordTask,
      {
        type: "publish",
        link: "l.orders-broker",
        queue: "reports",
        job: [
          {
            type: "consume",
            link: "l.broker-worker",
            operation: "build_report",
            latency: [900, 1600],
            retry: { maxAttempts: 3, baseDelayMs: 1000 },
            deadLetterLink: "l.broker-dlq",
          },
          {
            type: "persist",
            link: "l.worker-db",
            operation: "INSERT INTO reports",
            latency: [12, 28],
          },
          {
            type: "emit",
            links: ["l.worker-hub", "l.hub-web"],
            successEvent: "report.ready",
            failureEvent: "report.failed",
          },
        ],
      },
      {
        type: "respond",
        status: 202,
        statusText: "Accepted",
        body: { task_id: "$taskId", status: "queued" },
      },
    ],
  },

  retry: {
    id: "retry",
    request: paymentRequest,
    defaults: { ...baseOptions, providerFailures: 2 },
    controls: ["failures"],
    burst: 1,
    steps: paymentSteps({ maxAttempts: 3, baseDelayMs: 1000 }),
  },

  "dead-letter": {
    id: "dead-letter",
    request: paymentRequest,
    defaults: { ...baseOptions, providerFailures: 3 },
    controls: ["failures"],
    burst: 1,
    steps: paymentSteps({ maxAttempts: 3, baseDelayMs: 1000 }),
  },

  "circuit-breaker": {
    id: "circuit-breaker",
    request: {
      method: "GET",
      path: "/api/orders/42/checkout",
      protected: false,
    },
    defaults: { ...baseOptions, providerDown: true },
    controls: ["provider"],
    // One request per send: each send's narration tells its own step (timeout, trip, fail fast).
    burst: 1,
    steps: [
      ...toOrders,
      {
        type: "work",
        operation: "GET /api/orders/{id}/checkout",
        latency: [2, 5],
        note: "apiHandle",
      },
      { type: "call", link: "l.orders-payments" },
      {
        type: "guardedCall",
        link: "l.payments-provider",
        operation: "GET /v1/payment-methods",
        latency: [80, 160],
        breaker: { failureThreshold: 3, cooldownMs: 8000, timeoutMs: 2000 },
      },
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: { order_id: 42, payment_methods: ["card", "sbp"] },
      },
    ],
  },

  webhook: {
    id: "webhook",
    request: {
      method: "POST",
      path: "/webhooks/payments",
      protected: false,
      payload: "webhook",
      sampleBody: {
        id: "evt_8f3a",
        type: "payment.succeeded",
        data: { order_id: 42 },
      },
    },
    defaults: baseOptions,
    controls: ["body"],
    burst: 1,
    steps: [
      { type: "call", link: "l.provider-payments" },
      { type: "validate" },
      {
        type: "work",
        operation: "verify webhook signature",
        latency: [1, 3],
        note: "webhookReceived",
      },
      { type: "dedupe", field: "id", link: "l.payments-db" },
      {
        type: "query",
        link: "l.payments-db",
        operation: "UPDATE payments SET status = 'paid'",
        latency: [6, 14],
        note: "dbQuery",
      },
      {
        type: "respond",
        status: 200,
        statusText: "OK",
        body: { received: true },
      },
    ],
  },

  "fan-out": {
    id: "fan-out",
    request: {
      method: "POST",
      path: "/api/orders",
      protected: false,
      payload: "order",
      sampleBody: {
        product_id: "kb-7",
        quantity: 1,
        delivery: "standard",
      },
    },
    defaults: baseOptions,
    controls: ["body"],
    burst: 1,
    steps: [
      ...toOrders,
      { type: "validate" },
      {
        type: "work",
        operation: "POST /api/orders",
        latency: [3, 6],
        note: "apiHandle",
      },
      {
        // The order and its order.created event in one transaction (transactional outbox).
        type: "query",
        link: "l.orders-db",
        operation: "INSERT INTO orders, outbox",
        latency: [12, 26],
        note: "dbQuery",
      },
      {
        type: "fanout",
        link: "l.orders-kafka",
        event: "order.created",
        consumers: [
          {
            group: "inventory",
            link: "l.kafka-worker",
            label: "inventory · reserved",
            operation: "reserve stock",
            latency: [20, 60],
          },
          {
            group: "analytics",
            link: "l.kafka-worker-2",
            label: "analytics · counted",
            operation: "count the sale",
            latency: [5, 15],
          },
          {
            group: "notifications",
            link: "l.kafka-hub",
            label: "notification · queued",
            operation: "queue a notification",
            latency: [3, 10],
            push: "l.hub-web",
          },
        ],
      },
      {
        type: "respond",
        status: 201,
        statusText: "Created",
        body: { id: "$orderId", status: "created", "...": "$body" },
      },
    ],
  },

  chaos: {
    id: "chaos",
    request: {
      method: "POST",
      path: "/api/imports",
      protected: false,
      payload: "import",
      sampleBody: { rows: 6 },
    },
    defaults: { ...baseOptions, workerDown: true },
    controls: ["worker", "body"],
    burst: 1,
    steps: [
      ...toOrders,
      { type: "validate" },
      {
        type: "work",
        operation: "create import",
        latency: [3, 6],
        note: "apiHandle",
      },
      {
        type: "jobBatch",
        link: "l.orders-broker",
        queue: "imports",
        countField: "rows",
        operation: "import row",
        latency: [70, 130],
        workers: ["l.broker-worker", "l.broker-worker-2"],
        autoscaleAfterMs: 3600,
      },
      {
        type: "respond",
        status: 202,
        statusText: "Accepted",
        body: { import_id: "$taskId", status: "queued", "...": "$body" },
      },
    ],
  },
};
