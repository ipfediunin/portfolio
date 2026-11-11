import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveApi, LiveApiError, webhookSignature } from "./live-api";

const BASE = "http://live-api.test";
const TOKEN = "t".repeat(43);
const SECRET = "s".repeat(43);
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const TRACE = {
  trace_id: TRACE_ID,
  method: "GET",
  path: "/api/orders/42",
  status: 200,
  duration_ms: 3.2,
  spans: [
    {
      kind: "rate_limit",
      name: "EVALSHA token_buckets · client + ip",
      service: "orders-api",
      start_ms: 0.1,
      duration_ms: 0.4,
      ok: true,
      attributes: { remaining: 4 },
    },
  ],
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fake API: sandbox, one demo route and traces. Records every request it gets. */
function fakeApi(
  route: (request: Request) => Response = () =>
    json({ id: 42 }, 200, { "x-trace-id": TRACE_ID, "x-cache": "MISS" }),
) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const { pathname } = new URL(request.url);
      if (pathname === "/api/sandbox" && request.method === "POST")
        return json(
          { token: TOKEN, expires_in: 1800, webhook_secret: SECRET },
          201,
        );
      if (pathname === `/api/traces/${TRACE_ID}`) return json(TRACE);
      return route(request);
    }),
  );
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveApi", () => {
  it("creates an anonymous sandbox once and sends its token", async () => {
    const requests = fakeApi();
    const api = new LiveApi(BASE, null);
    const request = {
      method: "GET",
      path: "/api/orders/42",
      body: null,
      authorized: true,
      noCache: false,
    } as const;
    await api.send(request);
    await api.send(request);

    const sandboxes = requests.filter((item) =>
      item.url.endsWith("/api/sandbox"),
    );
    expect(sandboxes).toHaveLength(1);
    const demo = requests.filter((item) => item.url.endsWith("/api/orders/42"));
    expect(demo[0]?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(demo[0]?.headers.get("traceparent")).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
    // Only an explicit "miss" may ask the service to skip its cache.
    expect(demo[0]?.headers.get("cache-control")).toBeNull();
    expect(demo[0]?.cache).toBe("default");
    expect(api.sandboxExpiresAt).toBeGreaterThan(Date.now());
  });

  it("returns the response, the measured round trip and the validated trace", async () => {
    fakeApi();
    const exchange = await new LiveApi(BASE, null).send({
      method: "GET",
      path: "/api/products/7",
      body: null,
      authorized: false,
      noCache: true,
    });
    expect(exchange.response).toMatchObject({
      status: 200,
      statusText: "OK",
      body: { id: 42 },
      headers: { "x-cache": "MISS", "x-trace-id": TRACE_ID },
    });
    expect(exchange.trace.spans[0]?.attributes).toEqual({ remaining: 4 });
    expect(exchange.roundTripMs).toBeGreaterThanOrEqual(0);
  });

  it("sends no token when unauthorized and asks to skip the cache", async () => {
    const requests = fakeApi();
    await new LiveApi(BASE, null).send({
      method: "GET",
      path: "/api/products/7",
      body: null,
      authorized: false,
      noCache: true,
    });
    const demo = requests.find((item) => item.url.endsWith("/api/products/7"));
    expect(demo?.headers.get("authorization")).toBeNull();
    expect(demo?.headers.get("cache-control")).toBe("no-cache");
    expect(requests.some((item) => item.url.endsWith("/api/sandbox"))).toBe(
      false,
    );
  });

  it("reports an unreachable API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(
      new LiveApi(BASE, null).send({
        method: "GET",
        path: "/api/orders/42",
        body: null,
        authorized: true,
        noCache: false,
      }),
    ).rejects.toMatchObject({ failure: "unreachable" });
  });

  it("treats an answer without a trace as a protocol error", async () => {
    fakeApi(() => json({ id: 42 }));
    const sending = new LiveApi(BASE, null).send({
      method: "GET",
      path: "/api/orders/42",
      body: null,
      authorized: false,
      noCache: false,
    });
    await expect(sending).rejects.toBeInstanceOf(LiveApiError);
    await expect(sending).rejects.toMatchObject({ failure: "protocol" });
  });

  it("injects provider failures only when asked to", async () => {
    const requests = fakeApi();
    const api = new LiveApi(BASE, null);
    const payment = {
      method: "POST",
      path: "/api/orders/42/pay",
      body: "{}",
      authorized: true,
      noCache: false,
    } as const;
    await api.send({ ...payment, failAttempts: 2 });
    await api.send(payment);
    const [faulty, plain] = requests.filter((item) =>
      item.url.endsWith("/pay"),
    );
    expect(faulty?.headers.get("x-fault-fail-attempts")).toBe("2");
    expect(plain?.headers.get("x-fault-fail-attempts")).toBeNull();
  });

  it("signs a webhook with the sandbox's secret over the exact body", async () => {
    const requests = fakeApi();
    const body =
      '{"id":"evt_8f3a","type":"payment.succeeded","data":{"order_id":42}}';
    await new LiveApi(BASE, null).send({
      method: "POST",
      path: "/webhooks/payments",
      body,
      authorized: true,
      noCache: false,
      signWebhook: true,
    });
    const webhook = requests.find((item) =>
      item.url.endsWith("/webhooks/payments"),
    );
    const header = webhook?.headers.get("webhook-signature") ?? "";
    const [, timestamp, digest] =
      /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) ?? [];
    // The same HMAC the Payments API computes (backend/libs/contracts/webhooks.py).
    const expected = createHmac("sha256", SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    expect(digest).toBe(expected);
    expect(await webhookSignature(SECRET, body, Number(timestamp))).toBe(
      header,
    );
    expect(webhook?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("tells the provider stub to stop answering only when asked to", async () => {
    const requests = fakeApi();
    const api = new LiveApi(BASE, null);
    const checkout = {
      method: "GET",
      path: "/api/orders/42/checkout",
      body: null,
      authorized: true,
      noCache: false,
    } as const;
    await api.send({ ...checkout, providerDown: true });
    await api.send({ ...checkout, providerDown: false });
    const [down, up] = requests.filter((item) =>
      item.url.endsWith("/checkout"),
    );
    expect(down?.headers.get("x-fault-provider-down")).toBe("true");
    expect(up?.headers.get("x-fault-provider-down")).toBeNull();
  });

  it("polls the trace until the worker is done", async () => {
    vi.useFakeTimers();
    try {
      const spans = [{ ...TRACE.spans[0], kind: "consume", service: "worker" }];
      const states = ["pending", "pending", "done"];
      const requests: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          requests.push(input);
          const state = states.shift() ?? "done";
          return json({
            ...TRACE,
            background: { state, spans: state === "done" ? spans : [] },
          });
        }),
      );
      const waiting = new LiveApi(BASE, null).awaitBackground(TRACE_ID);
      await vi.advanceTimersByTimeAsync(1600);
      const background = await waiting;
      expect(background.state).toBe("done");
      expect(background.spans.map((span) => span.kind)).toEqual(["consume"]);
      expect(requests).toHaveLength(3);
      expect(
        requests.every((url) => url.endsWith(`/api/traces/${TRACE_ID}`)),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling when the page goes away", async () => {
    vi.useFakeTimers();
    try {
      const requests = fakeApi();
      const stop = new AbortController();
      const waiting = new LiveApi(BASE, null).awaitBackground(
        TRACE_ID,
        stop.signal,
      );
      stop.abort(new DOMException("closed", "AbortError"));
      await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(2000);
      expect(requests).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a trace without queued work as a protocol error while waiting", async () => {
    vi.useFakeTimers();
    try {
      fakeApi();
      const waiting = new LiveApi(BASE, null).awaitBackground(TRACE_ID);
      const settled = expect(waiting).rejects.toMatchObject({
        failure: "protocol",
      });
      await vi.advanceTimersByTimeAsync(600);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets the sandbox when it is deleted", async () => {
    const requests = fakeApi(() => new Response(null, { status: 204 }));
    const api = new LiveApi(BASE, null);
    await api
      .send({
        method: "GET",
        path: "/api/orders/42",
        body: null,
        authorized: true,
        noCache: false,
      })
      .catch(() => undefined); // the fake route returns no trace; only the sandbox matters here
    await api.deleteSandbox();
    expect(api.sandboxExpiresAt).toBeNull();
    const deletion = requests.find((item) => item.method === "DELETE");
    expect(deletion?.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });
});
