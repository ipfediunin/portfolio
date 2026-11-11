import { z } from "zod";

import {
  liveTraceSchema,
  type LiveBackground,
  type LiveExchange,
} from "@/simulation/live/live-exchange";

import { LiveEvents } from "./live-events";

/**
 * Browser client of the live backend: the Orders API and, behind the same address, the Payments
 * API's webhook endpoint and the realtime hub's socket (backend/). The sandbox token and its
 * webhook secret live only in this object's memory: a reload starts a new anonymous sandbox,
 * nothing is stored in the browser. Every answer is validated before the playground uses it.
 */

const TIMEOUT_MS = 8000;
/** Renew the sandbox a little before the server forgets it. */
const EXPIRY_MARGIN_MS = 10_000;
/** Without a socket, the trace is polled at the API's refill rate for trace reads (2 per second). */
const BACKGROUND_POLL_MS = 500;
/** With a socket, the trace is fetched when the hub says it is complete — or after this long. */
const SIGNAL_WAIT_MS = 3000;
/** Longer than any job takes (three attempts with 1 s and 2 s backoff); then the page stops. */
const BACKGROUND_WAIT_MS = 30_000;
/**
 * A new sandbox's first request waits this long at most for the hub's socket: pub/sub keeps
 * nothing, so a job that ends before the socket is ready would be pushed to nobody.
 */
const SOCKET_READY_MS = 1000;

const sandboxSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expires_in: z.number().int().positive(),
  // Signs the webhooks the page sends on behalf of the payment provider.
  webhook_secret: z.string().min(32).max(64),
});

/** The provider's signature header (backend/libs/contracts/webhooks.py). */
const SIGNATURE_HEADER = "Webhook-Signature";

/** Headers worth showing in the response panel (the API exposes them through CORS). */
const SHOWN_HEADERS = [
  "content-type",
  "x-trace-id",
  "x-cache",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "www-authenticate",
  "location",
  "x-idempotent-replay",
  "server-timing",
] as const;

const REASONS: Readonly<Record<number, string>> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export type LiveFailure = "unreachable" | "protocol" | "limited";

export class LiveApiError extends Error {
  constructor(
    readonly failure: LiveFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LiveApiError";
  }
}

export interface LiveRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body: string | null;
  /** Sends the sandbox token (the playground's "authorized" switch). */
  readonly authorized: boolean;
  /** `Cache-Control: no-cache`: the service skips its cache read. */
  readonly noCache: boolean;
  /**
   * Fault injection (`X-Fault-Fail-Attempts`): the payment provider stub fails this many calls
   * of the job before it succeeds. Only for the payment scenarios.
   */
  readonly failAttempts?: number;
  /** Fault injection (`X-Fault-Provider-Down`): the provider stub stops answering. */
  readonly providerDown?: boolean;
  /**
   * The request is a provider webhook: it is signed with the sandbox's secret, as the provider
   * would sign it (`Webhook-Signature: t=…,v1=HMAC-SHA256("t.body")`).
   */
  readonly signWebhook?: boolean;
}

/** Resolves after `ms`, or rejects with the signal's reason when it aborts first. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** HMAC-SHA256 of `message` (UTF-8) with `secret`, as hex (WebCrypto). */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The provider's signature over the exact body that is sent. */
export async function webhookSignature(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

/** A new W3C trace context: the service continues this trace id. */
function traceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  if (!response.headers.get("content-type")?.includes("json")) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new LiveApiError("protocol", "The API sent malformed JSON", {
      cause: error,
    });
  }
}

/** The realtime hub's socket, behind the same address as the API (`http` → `ws`). */
export function eventsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, "ws")}/ws`;
}

export class LiveApi {
  private token: string | null = null;
  private webhookSecret: string | null = null;
  private tokenExpiresAt = 0;
  private pendingSandbox: Promise<string> | null = null;
  /** The playground is on screen: keep the socket open while there is a sandbox. */
  private eventsWanted = true;

  constructor(
    private readonly baseUrl: string,
    /** Pushes from the realtime hub; null keeps the page polling (and tests offline). */
    readonly events: LiveEvents | null = new LiveEvents(eventsUrl(baseUrl)),
  ) {}

  /** Opens the socket again (the playground came back on screen). */
  resumeEvents(): void {
    this.eventsWanted = true;
    if (this.token && Date.now() < this.tokenExpiresAt)
      this.events?.connect(this.token);
  }

  /** Closes the socket while the playground is off screen. */
  pauseEvents(): void {
    this.eventsWanted = false;
    this.events?.disconnect();
  }

  /** When the current sandbox expires (epoch ms), or null before the first live request. */
  get sandboxExpiresAt(): number | null {
    return this.token ? this.tokenExpiresAt : null;
  }

  async send(request: LiveRequest): Promise<LiveExchange> {
    const headers: Record<string, string> = { traceparent: traceparent() };
    if (request.authorized)
      headers.Authorization = `Bearer ${await this.sandboxToken()}`;
    if (request.body !== null) headers["Content-Type"] = "application/json";
    if (request.noCache) headers["Cache-Control"] = "no-cache";
    if (request.failAttempts !== undefined)
      headers["X-Fault-Fail-Attempts"] = String(request.failAttempts);
    if (request.providerDown) headers["X-Fault-Provider-Down"] = "true";
    if (request.signWebhook && request.body !== null) {
      await this.sandboxToken();
      if (!this.webhookSecret)
        throw new LiveApiError("protocol", "The sandbox has no webhook secret");
      headers[SIGNATURE_HEADER] = await webhookSignature(
        this.webhookSecret,
        request.body,
      );
    }

    const started = performance.now();
    const response = await this.request(request.path, {
      method: request.method,
      headers,
      body: request.body,
    });
    const body = await readBody(response);
    const roundTripMs = performance.now() - started;

    const traceId = response.headers.get("x-trace-id");
    if (!traceId)
      throw new LiveApiError("protocol", "The response carries no trace id");
    const trace = liveTraceSchema.safeParse(
      await this.json(`/api/traces/${traceId}`),
    );
    if (!trace.success)
      throw new LiveApiError("protocol", "The trace has an unexpected shape", {
        cause: trace.error,
      });

    const shown: Record<string, string> = {};
    for (const name of SHOWN_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) shown[name] = value;
    }
    return {
      response: {
        status: response.status,
        statusText:
          response.statusText || (REASONS[response.status] ?? "Response"),
        headers: shown,
        body,
      },
      trace: trace.data,
      roundTripMs,
    };
  }

  /**
   * The background part of a trace (a job's attempts, an order event's consumers), once it is
   * complete. With the hub's socket open the trace is fetched when the hub says so; without it,
   * polled. Gives up after `BACKGROUND_WAIT_MS` and returns what there is, still `pending`.
   */
  async awaitBackground(
    traceId: string,
    signal?: AbortSignal,
  ): Promise<LiveBackground> {
    const deadline = Date.now() + BACKGROUND_WAIT_MS;
    this.events?.watch(traceId);
    try {
      for (;;) {
        const background = await this.nextBackground(traceId, signal);
        if (background.state === "done" || Date.now() >= deadline)
          return background;
      }
    } finally {
      this.events?.forget(traceId);
    }
  }

  private async nextBackground(
    traceId: string,
    signal?: AbortSignal,
  ): Promise<LiveBackground> {
    if (this.events?.state === "open")
      await this.events.waitForDone(traceId, SIGNAL_WAIT_MS, signal);
    else await pause(BACKGROUND_POLL_MS, signal);
    const trace = liveTraceSchema.safeParse(
      await this.json(`/api/traces/${traceId}`),
    );
    if (!trace.success)
      throw new LiveApiError("protocol", "The trace has an unexpected shape", {
        cause: trace.error,
      });
    const { background } = trace.data;
    if (!background)
      throw new LiveApiError("protocol", "The trace has no background work");
    return background;
  }

  /** Clears the sandbox's cache and refills its rate limit (no-op without a sandbox yet). */
  async reset(): Promise<void> {
    if (!this.token) return;
    await this.request("/api/sandbox/reset", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  /** Deletes the sandbox and everything made in it right away. */
  async deleteSandbox(): Promise<void> {
    if (!this.token) return;
    const token = this.token;
    this.token = null;
    this.webhookSecret = null;
    this.events?.disconnect();
    await this.request("/api/sandbox", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async sandboxToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - EXPIRY_MARGIN_MS)
      return this.token;
    this.pendingSandbox ??= this.createSandbox().finally(() => {
      this.pendingSandbox = null;
    });
    return this.pendingSandbox;
  }

  private async createSandbox(): Promise<string> {
    const response = await this.request("/api/sandbox", { method: "POST" });
    if (response.status === 429)
      throw new LiveApiError("limited", "Too many sandboxes from this network");
    const parsed = sandboxSchema.safeParse(await readBody(response));
    if (!response.ok || !parsed.success)
      throw new LiveApiError("protocol", "Could not create a sandbox");
    this.token = parsed.data.token;
    this.webhookSecret = parsed.data.webhook_secret;
    this.tokenExpiresAt = Date.now() + parsed.data.expires_in * 1000;
    const token = this.token;
    if (this.eventsWanted && this.events) {
      this.events.connect(token);
      await this.events.whenOpen(SOCKET_READY_MS);
    }
    return token;
  }

  private async json(path: string): Promise<unknown> {
    const response = await this.request(path, { method: "GET" });
    if (!response.ok)
      throw new LiveApiError(
        response.status === 429 ? "limited" : "protocol",
        `GET ${path} answered ${response.status}`,
      );
    return readBody(response);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        mode: "cors",
        credentials: "omit",
        // Default cache mode on purpose: "no-store" would make the browser send
        // `Cache-Control: no-cache`, which the service honours by skipping its cache. The API
        // marks its own responses `no-store`, so the browser does not cache them anyway.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new LiveApiError("unreachable", `${path} is not reachable`, {
        cause: error,
      });
    }
  }
}
