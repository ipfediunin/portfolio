import { z } from "zod";

/**
 * The page's socket to the realtime hub (backend/services/realtime-hub): the hub pushes what
 * concerns this page's sandbox — a report is ready, a payment went through or failed, an order was
 * created — and says when a trace it waits for is complete, so the page fetches the trace once
 * instead of polling it. The protocol mirrors `contracts.realtime` (backend); every message is
 * validated before use.
 *
 * The sandbox token is sent as the first message, never in the URL. The socket is optional: when
 * it cannot open, the page polls the trace as before.
 */

/** What the page shows: whether pushes arrive over a socket, or the page polls. */
export type ChannelState = "off" | "connecting" | "open" | "unavailable";

const notificationEvents = [
  "report.ready",
  "report.failed",
  "payment.succeeded",
  "payment.failed",
  "order.created",
] as const;
export type NotificationEvent = (typeof notificationEvents)[number];

const traceId = z.string().regex(/^[0-9a-f]{32}$/);

const hubMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    expires_in: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("notification"),
    event: z.enum(notificationEvents),
    task_id: z.uuid().nullable(),
    order_id: z.number().int().positive().nullable(),
    trace_id: traceId,
    at: z.iso.datetime({ offset: true }),
  }),
  z.object({ type: z.literal("trace.done"), trace_id: traceId }),
]);

export interface LiveNotification {
  readonly event: NotificationEvent;
  readonly taskId: string | null;
  readonly orderId: number | null;
  readonly traceId: string;
  /** When it happened (epoch ms). */
  readonly at: number;
}

/** Close codes the hub uses (`contracts.realtime.CloseCode`). */
const CLOSE = {
  unauthorized: 4401,
  sandboxGone: 4410,
  tooMany: 4429,
  policy: 1008,
} as const;

const NORMAL_CLOSE = 1000;
/** `WebSocket.OPEN`, without needing the global (absent where the module is only imported). */
const SOCKET_OPEN = 1;
/** Reconnect after 1, 2, 4, 8, 16 s; then the page polls until the next sandbox. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000] as const;
/** Finished traces remembered for a watch that comes late (the hub answers it at once anyway). */
const DONE_MEMORY = 50;

/** What the channel uses of the browser's WebSocket (a stand-in implements it in tests). */
export interface RealtimeSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: { readonly code: number }) => void,
  ): void;
}

export type SocketFactory = (url: string) => RealtimeSocket;

const browserSocket: SocketFactory = (url) => new WebSocket(url);

export class LiveEvents {
  private socket: RealtimeSocket | null = null;
  private token: string | null = null;
  private current: ChannelState = "off";
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly watched = new Set<string>();
  private readonly done: string[] = [];
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly stateListeners = new Set<(state: ChannelState) => void>();
  private readonly notificationListeners = new Set<
    (notification: LiveNotification) => void
  >();

  constructor(
    private readonly url: string,
    private readonly createSocket: SocketFactory = browserSocket,
  ) {}

  get state(): ChannelState {
    return this.current;
  }

  onState(listener: (state: ChannelState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onNotification(
    listener: (notification: LiveNotification) => void,
  ): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /** Opens the socket for this sandbox (reopens it for a new one). */
  connect(token: string): void {
    if (this.token === token && (this.socket || this.retryTimer)) return;
    this.disconnect();
    this.token = token;
    this.retries = 0;
    this.open();
  }

  /** Closes the socket; the page polls until `connect` is called again. */
  disconnect(): void {
    this.token = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(NORMAL_CLOSE);
    this.setState("off");
  }

  /** Asks the hub to say when this trace's background part is complete. */
  watch(traceId: string): void {
    this.watched.add(traceId);
    if (this.current === "open")
      this.send({ type: "watch", trace_id: traceId });
  }

  forget(traceId: string): void {
    this.watched.delete(traceId);
  }

  /**
   * Resolves once the socket is open and authenticated, or when it cannot be (closed, refused),
   * or after `withinMs` — whichever comes first. Never rejects: the page works without a socket.
   */
  whenOpen(withinMs: number): Promise<void> {
    if (this.current !== "connecting") return Promise.resolve();
    return new Promise((resolve) => {
      const settle = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = setTimeout(settle, withinMs);
      const unsubscribe = this.onState((state) => {
        if (state !== "connecting") settle();
      });
    });
  }

  /**
   * Resolves true once the hub says the trace is complete (also if it already did), false when
   * `withinMs` pass first. Rejects when `signal` aborts.
   */
  waitForDone(
    traceId: string,
    withinMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (this.done.includes(traceId)) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const waiters = this.waiters.get(traceId) ?? new Set<() => void>();
      this.waiters.set(traceId, waiters);
      const settle = (outcome: boolean | "aborted") => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        waiters.delete(onDone);
        if (waiters.size === 0) this.waiters.delete(traceId);
        if (outcome === "aborted") reject(signal?.reason);
        else resolve(outcome);
      };
      const onDone = () => settle(true);
      const onAbort = () => settle("aborted");
      const timer = setTimeout(() => settle(false), withinMs);
      waiters.add(onDone);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private open(): void {
    const token = this.token;
    if (!token) return;
    this.setState("connecting");
    let socket: RealtimeSocket;
    try {
      socket = this.createSocket(this.url);
    } catch {
      // A blocked scheme or a malformed URL (the constructor throws): no socket, the page polls.
      this.setState("unavailable");
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket === socket) this.send({ type: "auth", token });
    });
    socket.addEventListener("message", (event) => {
      if (this.socket === socket) this.receive(event.data);
    });
    // A failed connection fires `error` and then `close`; the close decides what happens next.
    socket.addEventListener("close", (event) => {
      if (this.socket === socket) this.closed(event.code);
    });
  }

  private receive(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // not from the hub's protocol: ignored, like any other unknown message
    }
    const message = hubMessageSchema.safeParse(parsed);
    if (!message.success) return;
    switch (message.data.type) {
      case "ready":
        this.retries = 0;
        this.setState("open");
        for (const traceId of this.watched)
          this.send({ type: "watch", trace_id: traceId });
        break;
      case "notification": {
        const { event, task_id, order_id, trace_id, at } = message.data;
        const notification: LiveNotification = {
          event,
          taskId: task_id,
          orderId: order_id,
          traceId: trace_id,
          at: Date.parse(at),
        };
        for (const listener of this.notificationListeners)
          listener(notification);
        break;
      }
      case "trace.done":
        this.finished(message.data.trace_id);
        break;
    }
  }

  private finished(traceId: string): void {
    this.watched.delete(traceId);
    this.done.push(traceId);
    if (this.done.length > DONE_MEMORY) this.done.shift();
    for (const waiter of [...(this.waiters.get(traceId) ?? [])]) waiter();
  }

  private closed(code: number): void {
    this.socket = null;
    if (!this.token) return;
    if (code === CLOSE.unauthorized || code === CLOSE.sandboxGone) {
      // The sandbox is gone; the next live request makes a new one and reconnects.
      this.token = null;
      this.setState("off");
      return;
    }
    const delay = RETRY_DELAYS_MS[this.retries];
    if (
      code === CLOSE.tooMany ||
      code === CLOSE.policy ||
      delay === undefined
    ) {
      this.setState("unavailable");
      return;
    }
    this.retries += 1;
    this.setState("unavailable");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private send(message: Record<string, string>): void {
    if (this.socket?.readyState === SOCKET_OPEN)
      this.socket.send(JSON.stringify(message));
  }

  private setState(state: ChannelState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
