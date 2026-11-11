import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveApi, eventsUrl } from "./live-api";
import {
  LiveEvents,
  type ChannelState,
  type LiveNotification,
  type RealtimeSocket,
} from "./live-events";

const HUB_URL = "ws://live-api.test/ws";
const TOKEN = "t".repeat(43);
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

type Listener = (event: { data: unknown; code: number }) => void;

/** The hub's side of a socket, driven by the test. */
class FakeSocket implements RealtimeSocket {
  readyState = 0;
  readonly sent: unknown[] = [];
  closedWith: number | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  accept(): void {
    this.readyState = 1;
    this.emit("open", {});
  }

  push(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  drop(code: number): void {
    this.readyState = 3;
    this.emit("close", { code });
  }

  private emit(type: string, event: { data?: unknown; code?: number }): void {
    for (const listener of this.listeners.get(type) ?? [])
      listener({ data: event.data, code: event.code ?? 1000 });
  }
}

let sockets: FakeSocket[];

function channel(): LiveEvents {
  return new LiveEvents(HUB_URL, (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  });
}

/** A hub that accepts every socket at once, as a healthy one does. */
function readyChannel(): LiveEvents {
  return new LiveEvents(HUB_URL, (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    queueMicrotask(() => {
      socket.accept();
      socket.push({ type: "ready", expires_in: 1800 });
    });
    return socket;
  });
}

function opened(events: LiveEvents): FakeSocket {
  events.connect(TOKEN);
  const socket = sockets.at(-1);
  if (!socket) throw new Error("No socket opened");
  socket.accept();
  socket.push({ type: "ready", expires_in: 1800 });
  return socket;
}

beforeEach(() => {
  sockets = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveEvents", () => {
  it("authenticates with the first message, not in the URL", () => {
    const events = channel();
    const states: ChannelState[] = [];
    events.onState((state) => states.push(state));
    const socket = opened(events);
    expect(socket.url).toBe(HUB_URL);
    expect(socket.sent[0]).toEqual({ type: "auth", token: TOKEN });
    expect(events.state).toBe("open");
    expect(states).toEqual(["connecting", "open"]);
  });

  it("hands validated notifications to the page and ignores anything else", () => {
    const events = channel();
    const heard: LiveNotification[] = [];
    events.onNotification((notification) => heard.push(notification));
    const socket = opened(events);
    socket.push({
      type: "notification",
      event: "payment.succeeded",
      task_id: "6f1c2a52-0d3c-4bb2-9a7e-1d9f7c2a1b10",
      order_id: 42,
      trace_id: TRACE_ID,
      at: "2026-11-05T18:21:01.190840Z",
    });
    socket.push({ type: "notification", event: "rm -rf", trace_id: TRACE_ID });
    socket.push({ type: "unknown" });
    expect(heard).toEqual([
      {
        event: "payment.succeeded",
        taskId: "6f1c2a52-0d3c-4bb2-9a7e-1d9f7c2a1b10",
        orderId: 42,
        traceId: TRACE_ID,
        at: Date.parse("2026-11-05T18:21:01.190840Z"),
      },
    ]);
  });

  it("watches a trace and resolves when the hub says it is done", async () => {
    const events = channel();
    const socket = opened(events);
    events.watch(TRACE_ID);
    expect(socket.sent.at(-1)).toEqual({ type: "watch", trace_id: TRACE_ID });
    const waiting = events.waitForDone(TRACE_ID, 3000);
    socket.push({ type: "trace.done", trace_id: TRACE_ID });
    await expect(waiting).resolves.toBe(true);
    // Already announced: a later wait does not wait at all.
    await expect(events.waitForDone(TRACE_ID, 3000)).resolves.toBe(true);
  });

  it("gives up waiting after the timeout, so the page fetches anyway", async () => {
    vi.useFakeTimers();
    const events = channel();
    opened(events);
    const waiting = events.waitForDone(TRACE_ID, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(waiting).resolves.toBe(false);
  });

  it("sends watches made before the socket was ready once it is", () => {
    const events = channel();
    events.watch(TRACE_ID);
    const socket = opened(events);
    expect(socket.sent).toEqual([
      { type: "auth", token: TOKEN },
      { type: "watch", trace_id: TRACE_ID },
    ]);
  });

  it("reconnects with a growing pause after the socket drops", async () => {
    vi.useFakeTimers();
    const events = channel();
    opened(events).drop(1006);
    expect(events.state).toBe("unavailable");
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]?.drop(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
  });

  it("stops when the sandbox is gone, until the next one connects", async () => {
    vi.useFakeTimers();
    const events = channel();
    opened(events).drop(4410);
    expect(events.state).toBe("off");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    events.connect("n".repeat(43));
    expect(sockets).toHaveLength(2);
  });

  it("does not retry when the hub refuses more sockets", async () => {
    vi.useFakeTimers();
    const events = channel();
    opened(events).drop(4429);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events.state).toBe("unavailable");
    expect(sockets).toHaveLength(1);
  });

  it("closes the socket and stops retrying on disconnect", async () => {
    vi.useFakeTimers();
    const events = channel();
    const socket = opened(events);
    events.disconnect();
    expect(socket.closedWith).toBe(1000);
    expect(events.state).toBe("off");
    socket.drop(1000); // the close event of the socket it closed changes nothing
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });
});

describe("LiveApi with the hub's socket", () => {
  function trace(state: "pending" | "done") {
    return {
      trace_id: TRACE_ID,
      method: "POST",
      path: "/api/reports",
      status: 202,
      duration_ms: 4.1,
      spans: [],
      background: { state, spans: [] },
    };
  }

  function fakeApi() {
    const traceReads: string[] = [];
    const sentAfterAuth: boolean[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const { pathname } = new URL(input);
        const json = (body: unknown, status = 200, headers = {}) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json", ...headers },
          });
        if (pathname === "/api/sandbox")
          return json(
            { token: TOKEN, expires_in: 1800, webhook_secret: "s".repeat(43) },
            201,
          );
        if (pathname === `/api/traces/${TRACE_ID}`) {
          traceReads.push(pathname);
          return json(trace(traceReads.length > 1 ? "done" : "pending"));
        }
        sentAfterAuth.push(
          JSON.stringify(sockets.at(-1)?.sent[0]) ===
            JSON.stringify({ type: "auth", token: TOKEN }),
        );
        return json({ task_id: "x", status: "queued" }, 202, {
          "x-trace-id": TRACE_ID,
        });
      }),
    );
    return { traceReads, sentAfterAuth };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts the socket behind the API's address", () => {
    expect(eventsUrl("https://api.example.com")).toBe(
      "wss://api.example.com/ws",
    );
    expect(eventsUrl("http://localhost:8000")).toBe("ws://localhost:8000/ws");
  });

  it("opens the socket for a new sandbox and fetches the trace when the hub says so", async () => {
    const { traceReads, sentAfterAuth } = fakeApi();
    const events = readyChannel();
    const api = new LiveApi("http://live-api.test", events);
    await api.send({
      method: "POST",
      path: "/api/reports",
      body: "{}",
      authorized: true,
      noCache: false,
    });
    const socket = sockets.at(-1);
    if (!socket) throw new Error("No socket opened for the sandbox");
    // The first request of the sandbox went out once the socket was listening.
    expect(sentAfterAuth).toEqual([true]);

    const waiting = api.awaitBackground(TRACE_ID);
    expect(socket.sent.at(-1)).toEqual({ type: "watch", trace_id: TRACE_ID });
    socket.push({ type: "trace.done", trace_id: TRACE_ID });
    await expect(waiting).resolves.toMatchObject({ state: "done" });
    // Once with the response, once when the hub said so: no polling in between.
    expect(traceReads).toHaveLength(2);
  });

  it("does not hold the first request long when the hub does not answer", async () => {
    vi.useFakeTimers();
    fakeApi();
    const api = new LiveApi("http://live-api.test", channel());
    const sending = api.send({
      method: "POST",
      path: "/api/reports",
      body: "{}",
      authorized: true,
      noCache: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(sending).resolves.toMatchObject({
      response: { status: 202 },
    });
  });

  it("closes the socket while the playground is away and opens it again", async () => {
    fakeApi();
    const events = readyChannel();
    const api = new LiveApi("http://live-api.test", events);
    await api.send({
      method: "POST",
      path: "/api/reports",
      body: "{}",
      authorized: true,
      noCache: false,
    });
    expect(sockets).toHaveLength(1);
    api.pauseEvents();
    expect(sockets[0]?.closedWith).toBe(1000);
    api.resumeEvents();
    expect(sockets).toHaveLength(2);
    await api.deleteSandbox();
    expect(events.state).toBe("off");
  });
});
