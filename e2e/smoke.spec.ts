import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Request } from "@playwright/test";

import { projects } from "../src/content/projects";
import { landingServices } from "../src/content/services";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("one English site", () => {
  test("serves the home page at the root, in English, without redirects", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Full-Stack & AI Engineer",
    );
  });

  test("ignores the browser language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("sends /services and trailing-slash URLs to one address", async ({
    page,
  }) => {
    await page.goto("/services");
    await expect(page).toHaveURL(/\/hire$/);
    await page.goto("/projects/");
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("has no language prefixes or switcher", async ({ page }) => {
    expect((await page.goto("/ru"))?.status()).toBe(404);
    await page.goto("/about");
    await expect(
      page.getByRole("link", { name: /Русский|English/ }),
    ).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
  });
});

test.describe("pages", () => {
  test("the load and chaos report shows measured runs", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page
      .getByRole("link", { name: /holds up under load and failure/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Load and chaos report" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Chaos", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Redis is down" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Container limits (compose)" }),
    ).toBeVisible();
    // The page never scrolls sideways; wide tables scroll inside their box.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("home renders without errors and starts the scene", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const scene = page
      .getByRole("img", { name: /An isometric system map/ })
      .first();
    await expect(scene.locator("canvas")).toHaveCount(1, { timeout: 20_000 });
    // The scene must never swallow touch scrolling (PixiJS sets touch-action: none by default).
    await expect(scene.locator("canvas")).toHaveCSS("touch-action", "auto");
    expect(errors).toEqual([]);
  });

  test("leads both audiences from the hero", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("link", { name: "Explore projects" }),
    ).toHaveAttribute("href", "/projects");
    await expect(
      main.getByRole("link", { name: "Work with me" }),
    ).toHaveAttribute("href", "/hire");
    await expect(
      main.getByRole("link", { name: "See my engineering profile" }),
    ).toHaveAttribute("href", "/for-employers");
    // No résumé is configured in this build, so none is offered.
    await expect(page.getByRole("link", { name: /résumé/i })).toHaveCount(0);
  });

  test("sends the visitor's request from the hero", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Send a request/ }).click();
    await expect(page.getByText(/200 OK · [\d.]+ ms/)).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole("link", { name: /Inspect it in the playground/ })
      .click();
    // The playground drops ?scenario= only after it hydrates, which is slow under parallel load.
    await expect(page).toHaveURL(/\/architecture$/, { timeout: 15_000 });
    await expect(
      page.getByRole("region", { name: "Response" }).getByText("200 OK"),
    ).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("renders the scene as a still frame without errors", async ({
      page,
    }) => {
      const errors = collectPageErrors(page);
      await page.goto("/");
      const host = page.locator("[data-scene-host]").first();
      await expect(host.locator("canvas")).toHaveCount(1, { timeout: 20_000 });
      await expect(host).toHaveCSS("opacity", "1");
      expect(errors).toEqual([]);
    });
  });

  test("keeps one canvas across client-side navigation", async ({ page }) => {
    await page.goto("/");
    const homeCanvas = page.locator("[data-scene-host] canvas");
    await expect(homeCanvas).toHaveCount(1, { timeout: 20_000 });
    await homeCanvas.evaluate((canvas) =>
      canvas.setAttribute("data-e2e-marker", "kept"),
    );

    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "System playground" })
      .click();
    await expect(page).toHaveURL(/\/architecture$/, { timeout: 15_000 });
    await expect(
      page.locator('[data-scene-host] canvas[data-e2e-marker="kept"]'),
    ).toHaveCount(1);
  });

  test("an expertise area links its technologies to the district", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/expertise/backend");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Backend");
    const fastapi = page.getByRole("button", { name: /^FastAPI/ });
    await expect(fastapi).toContainText("Orders API");
    await fastapi.click();
    await expect(
      page.getByRole("complementary", { name: /Orders API/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Frontend", exact: true }).click();
    await expect(page).toHaveURL(/\/expertise\/frontend$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Frontend",
    );
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("unknown routes return the 404 page", async ({ page }) => {
    const response = await page.goto("/no-such-route");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page not found",
    );
  });

  test("unknown expertise areas and services return 404", async ({ page }) => {
    for (const path of ["/expertise/design", "/services/data-processing"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(
        "Page not found",
      );
    }
  });

  test("keeps draft case studies out of the production build", async ({
    page,
    request,
  }) => {
    const drafts = projects.filter((project) => !project.published);
    test.skip(drafts.length === 0, "every case study is published");
    const sitemap = await (await request.get("/sitemap.xml")).text();

    await page.goto("/projects");
    for (const draft of drafts) {
      await expect(page.getByText(draft.title)).toHaveCount(0);
      expect(sitemap).not.toContain(`/projects/${draft.slug}`);
    }
    await page.goto(`/projects/${drafts[0]!.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page not found",
    );
  });
});

test.describe("navigation", () => {
  test("the Work with me menu opens, closes with Escape and leads to both pages", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The disclosure menu is the desktop header.");
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const toggle = nav.getByRole("button", { name: "Work with me" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await nav.getByRole("link", { name: /For employers/ }).click();
    await expect(page).toHaveURL(/\/for-employers$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Engineering profile",
    );

    await nav.getByRole("button", { name: "Work with me" }).click();
    await nav.getByRole("link", { name: /For clients/ }).click();
    await expect(page).toHaveURL(/\/hire$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Custom Python Backend, AI & Web Development",
    );
  });

  test("the mobile menu opens, navigates and closes with Escape", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "The menu button only exists on small screens.");
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(
      page.getByRole("button", { name: "Close menu" }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page
      .getByRole("banner")
      .getByRole("link", { name: /For clients/ })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/hire$/, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Open menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("work with me", () => {
  test("the client page shows six services that link to cases and landing pages", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/hire");
    const services = page.getByRole("article");
    await expect(services).toHaveCount(6);
    await expect(
      services.first().getByRole("link", {
        name: /Web Applications|Event-Driven|Process Automation/,
      }),
    ).not.toHaveCount(0);
    await page
      .getByRole("link", { name: "More about AI & RAG Solutions" })
      .click();
    await expect(page).toHaveURL(/\/services\/ai-rag$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "RAG & LLM Application Development",
    );
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" }),
    ).toContainText("For clients");
    expect(errors).toEqual([]);
  });

  test("every service landing page renders its related cases", async ({
    page,
  }) => {
    for (const service of landingServices) {
      await page.goto(`/services/${service.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        service.landing.title,
      );
      await expect(
        page.getByRole("heading", { name: "Related case studies" }),
      ).toBeVisible();
    }
  });

  test("the employer page offers role contact and shows only configured links", async ({
    page,
  }) => {
    await page.goto("/for-employers");
    await expect(
      page.getByRole("link", { name: "Get in touch about a role" }).first(),
    ).toHaveAttribute("href", "/contact?topic=role");
    await expect(page.getByRole("link", { name: /résumé/i })).toHaveCount(0);
    await expect(page.locator('a[href*="example."]')).toHaveCount(0);
  });

  test("a case study names its basis and links its services", async ({
    page,
  }) => {
    await page.goto("/projects/event-driven");
    await expect(
      page.getByText("Generalised experience across several systems"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary")
        .getByRole("link", { name: "Backend Integrations & Messaging" }),
    ).toHaveAttribute("href", "/hire#service-integrations-messaging");
  });
});

test.describe("playground", () => {
  test("validates the body like FastAPI and accepts a fixed one", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    const response = page.getByRole("region", { name: "Response" });

    await page.getByText("Validation error").click();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect(response.getByText("422 Unprocessable Entity")).toBeVisible({
      timeout: 20_000,
    });
    await expect(response).toContainText('"quantity"');

    await page.getByLabel("Request body (JSON)").fill(
      JSON.stringify({
        product_id: "kb-7",
        quantity: 2,
        delivery: "express",
      }),
    );
    await page.getByLabel("Request body (JSON)").press("Control+Enter");
    await expect(response.getByText("201 Created")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("log")).toContainText("201 Created");
    expect(errors).toEqual([]);
  });

  test("acknowledges a repeated webhook without processing it twice", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    const response = page.getByRole("region", { name: "Response" });
    await page.getByText("Idempotent webhook", { exact: true }).click();
    await page.getByRole("radio", { name: "2×" }).click();
    const send = page.getByRole("button", { name: /^Send/ });

    await send.click();
    await expect(response).toContainText('"received": true', {
      timeout: 20_000,
    });
    await expect(response).not.toContainText('"duplicate"');
    await send.click();
    await expect(response).toContainText('"duplicate": true', {
      timeout: 20_000,
    });
    expect(errors).toEqual([]);
  });

  test("runs on DOM panels alone when WebGL is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === "webgl" || type === "webgl2") return null;
        return Reflect.apply(getContext, this, [type, ...rest]) as ReturnType<
          HTMLCanvasElement["getContext"]
        >;
      } as HTMLCanvasElement["getContext"];
    });
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    const response = page.getByRole("region", { name: "Response" });

    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect(response.getByText("200 OK")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-scene-host] canvas")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

const LIVE_API = "http://live-api.test";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE",
  "access-control-allow-headers":
    "authorization, content-type, cache-control, traceparent, x-fault-fail-attempts, x-fault-provider-down, webhook-signature",
  "access-control-expose-headers":
    "x-trace-id, server-timing, x-cache, retry-after, x-ratelimit-limit, x-ratelimit-remaining, www-authenticate, location, x-idempotent-replay",
};

interface RecordedSpan {
  readonly kind: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

interface RecordedExchange {
  readonly request: { readonly path: string };
  readonly response: {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: unknown;
  };
  readonly trace: {
    readonly trace_id: string;
    readonly spans: readonly RecordedSpan[];
    readonly background: {
      readonly state: string;
      readonly spans: readonly RecordedSpan[];
    } | null;
  };
}

/** A fixture recorded from the real Orders API (backend/libs/contracts/fixtures). */
function recorded(scenario: string): RecordedExchange {
  const file = resolve("backend/libs/contracts/fixtures", `${scenario}.json`);
  return JSON.parse(readFileSync(file, "utf-8")) as RecordedExchange;
}

/**
 * Answers the live API's requests with a recorded exchange, as the real service would. Queued work
 * is "still running" on the first trace read (as right after the 202), done on the next ones.
 * Returns the demo requests the page sent.
 */
async function serveLiveApi(page: Page, exchange: RecordedExchange) {
  const sent: Request[] = [];
  let traceReads = 0;
  await page.route(`${LIVE_API}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = { ...CORS, "content-type": "application/json" };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS });
    if (pathname === "/api/sandbox" && request.method() === "POST")
      return route.fulfill({
        status: 201,
        headers: json,
        body: JSON.stringify({
          token: "t".repeat(43),
          expires_in: 1800,
          webhook_secret: "s".repeat(43),
        }),
      });
    if (pathname.startsWith("/api/traces/")) {
      traceReads += 1;
      const { background } = exchange.trace;
      const trace =
        background && traceReads === 1
          ? { ...exchange.trace, background: { state: "pending", spans: [] } }
          : exchange.trace;
      return route.fulfill({
        status: 200,
        headers: json,
        body: JSON.stringify(trace),
      });
    }
    if (pathname === exchange.request.path) {
      sent.push(request);
      return route.fulfill({
        status: exchange.response.status,
        headers: { ...CORS, ...exchange.response.headers },
        body: JSON.stringify(exchange.response.body),
      });
    }
    return route.fulfill({ status: 404, headers: json, body: "{}" });
  });
  await serveRealtimeHub(page, exchange);
  return sent;
}

/**
 * Stands in for the realtime hub's socket: accepts the sandbox's token, and when the page watches
 * the trace, pushes the notification the hub recorded (if any) and says the trace is done.
 */
async function serveRealtimeHub(page: Page, exchange: RecordedExchange) {
  const push = exchange.trace.background?.spans.find(
    (span) => span.kind === "push",
  );
  await page.routeWebSocket(
    `${LIVE_API.replace("http", "ws")}/ws`,
    (socket) => {
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw)) as {
          type: string;
          trace_id?: string;
        };
        if (message.type === "auth")
          socket.send(JSON.stringify({ type: "ready", expires_in: 1800 }));
        if (message.type !== "watch" || !message.trace_id) return;
        if (push)
          socket.send(
            JSON.stringify({
              type: "notification",
              event: push.attributes?.event,
              task_id: null,
              order_id: null,
              trace_id: message.trace_id,
              at: "2026-11-05T18:21:01.190840Z",
            }),
          );
        socket.send(
          JSON.stringify({ type: "trace.done", trace_id: message.trace_id }),
        );
      });
    },
  );
}

test.describe("live API mode", () => {
  test("replays the real service's answer and trace", async ({ page }) => {
    const exchange = recorded("sync-read");
    await serveLiveApi(page, exchange);
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await expect(
      page.getByText(/real FastAPI and Django services/),
    ).toBeVisible();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();

    const response = page.getByRole("region", { name: "Response" });
    await expect(response.getByText("200 OK")).toBeVisible({ timeout: 20_000 });
    await expect(response.getByText("Live", { exact: true })).toBeVisible();
    const statement = exchange.trace.spans.find((span) =>
      span.name.startsWith("SELECT"),
    );
    if (!statement) throw new Error("The fixture has no SQL span");
    await expect(
      page.getByRole("region", { name: "Trace" }).getByText(statement.name),
    ).toBeVisible();
    await expect(page.getByText(/Your sandbox expires at/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("says so when the live API is unreachable", async ({ page }) => {
    await page.route(`${LIVE_API}/**`, (route) => route.abort());
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();
    // Next.js has its own (empty) role="alert" route announcer; pick ours by its text.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The live API is not reachable" }),
    ).toBeVisible();
  });

  test("replays a queued payment: the response first, then the worker's retries", async ({
    page,
  }) => {
    const exchange = recorded("retry");
    const sent = await serveLiveApi(page, exchange);
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page.getByText("Retries with backoff", { exact: true }).click();
    await expect(page.getByText(/fault injection/)).toBeVisible();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();

    const response = page.getByRole("region", { name: "Response" });
    await expect(response.getByText("202 Accepted")).toBeVisible({
      timeout: 20_000,
    });
    // The worker's spans arrive after the response and continue the same trace.
    const lastAttempt = exchange.trace.background?.spans.filter(
      (span) => span.kind === "consume",
    )[2];
    if (!lastAttempt) throw new Error("The fixture has no third attempt");
    await expect(
      page.getByRole("region", { name: "Trace" }).getByText(lastAttempt.name),
    ).toBeVisible({ timeout: 40_000 });
    expect(sent[0]?.headers()["x-fault-fail-attempts"]).toBe("2");
    expect(errors).toEqual([]);
  });

  test("pushes a job's outcome over the page's socket instead of polling", async ({
    page,
  }) => {
    const exchange = recorded("async-job");
    await serveLiveApi(page, exchange);
    const traceReads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/traces/"))
        traceReads.push(request.url());
    });
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page.getByText("Background job", { exact: true }).click();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();

    await expect(
      page.getByRole("region", { name: "Response" }).getByText("202 Accepted"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Last push: report.ready.")).toBeVisible();
    await expect(
      page.getByText(/Results are pushed to this page over a WebSocket/),
    ).toBeVisible();
    const push = exchange.trace.background?.spans.find(
      (span) => span.kind === "push",
    );
    if (!push) throw new Error("The fixture has no push span");
    await expect(
      page.getByRole("region", { name: "Trace" }).getByText(push.name),
    ).toBeVisible({ timeout: 40_000 });
    // Once with the response, once when the hub said the job was done.
    expect(traceReads).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test("signs a provider webhook in the browser and replays Django's trace", async ({
    page,
  }) => {
    const exchange = recorded("webhook");
    const sent = await serveLiveApi(page, exchange);
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page.getByText("Idempotent webhook", { exact: true }).click();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();

    const response = page.getByRole("region", { name: "Response" });
    await expect(response.getByText("200 OK")).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .getByRole("region", { name: "Trace" })
        .getByText("verify HMAC-SHA256 signature"),
    ).toBeVisible();
    expect(sent[0]?.headers()["webhook-signature"]).toMatch(
      /^t=\d+,v1=[0-9a-f]{64}$/,
    );
    expect(errors).toEqual([]);
  });

  test("keeps scenarios without a live backend as simulations", async ({
    page,
  }) => {
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page.getByText("Chaos: a worker goes down", { exact: true }).click();
    await expect(
      page.getByText(/This scenario runs as a simulation/),
    ).toBeVisible();
  });

  test("replays an order's events: the relay's publish, then every consumer group", async ({
    page,
  }) => {
    const exchange = recorded("fan-out");
    await serveLiveApi(page, exchange);
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    await page.getByRole("radio", { name: "Live API" }).click();
    await page
      .getByText("Fan-out: one event, three subscribers", { exact: true })
      .click();
    await page.getByRole("radio", { name: "2×" }).click();
    await page.getByRole("button", { name: /^Send/ }).click();

    const response = page.getByRole("region", { name: "Response" });
    await expect(response.getByText("201 Created")).toBeVisible({
      timeout: 20_000,
    });
    const background = exchange.trace.background?.spans ?? [];
    const publish = background.find((span) => span.kind === "publish");
    const notified = background.find(
      (span) =>
        span.kind === "consume" && span.attributes?.group === "notifications",
    );
    if (!publish || !notified)
      throw new Error("The fixture has no publish or notifications span");
    const trace = page.getByRole("region", { name: "Trace" });
    await expect(trace.getByText(publish.name)).toBeVisible({
      timeout: 40_000,
    });
    await expect(trace.getByText(notified.name)).toBeVisible({
      timeout: 40_000,
    });
    expect(errors).toEqual([]);
  });
});

test.describe("district stories", () => {
  test("play on the district's scene with step-by-step narration", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/expertise/automation");
    const story = page.getByRole("button", { name: /A bot starts a sync/ });
    await story.click();
    await page.getByRole("radio", { name: "2×" }).click();
    const narration = page.getByRole("region", { name: "Playback" });
    await expect(narration).toContainText("/sync", { timeout: 10_000 });
    await expect(narration).toContainText("The bot reports the result", {
      timeout: 30_000,
    });
    await expect(story).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });
});

test.describe("node inspector", () => {
  test("opens from the component list, runs a scenario and gives focus back", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/architecture");
    const item = page.getByRole("button", { name: /^Redis Cache/ });
    await item.focus();
    await page.keyboard.press("Enter");

    const inspector = page.getByRole("complementary", { name: /Redis Cache/ });
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("TTL");
    await expect(item).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(inspector).toHaveCount(0);
    await expect(item).toBeFocused();

    await page.keyboard.press("Enter");
    await inspector.getByRole("button", { name: "Cache miss and hit" }).click();
    await expect(
      page.getByRole("region", { name: "Response" }).getByText("200 OK"),
    ).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });
});

test("the logo scrolls the home page back to the top", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 1600));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(400);
  await page
    .getByRole("banner")
    .getByRole("link", { name: /IP Fediunin/ })
    .click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page).toHaveURL(/\/$/);
});

test.describe("case studies", () => {
  test("lists every published case and the AI workflow", async ({ page }) => {
    await page.goto("/projects");
    const list = page.locator("main");
    for (const project of projects.filter((item) => item.published))
      await expect(
        list.getByRole("link", { name: project.title }),
      ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "AI-assisted Software Engineering" }),
    ).toBeVisible();
  });

  test("sums the case up at a glance and folds the full story", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto("/projects/knowledge-base");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Intelligent Knowledge Base",
      }),
    ).toBeVisible();
    const glance = page.getByRole("region", { name: "At a glance" });
    // On a short desktop the strip starts folded over the world; the visitor unfolds it.
    const toggle = page.getByRole("button", { name: "At a glance" });
    if (await toggle.isVisible()) {
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
    await expect(glance.getByRole("heading", { name: "Before" })).toBeVisible();
    await expect(glance.getByRole("heading", { name: "After" })).toBeVisible();
    // The figure counts up when it scrolls in; screen readers and the end state show the result.
    const chart = glance.getByRole("figure", { name: "Answer time" });
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toContainText("faster when a question is asked again");
    await expect(chart).toContainText("12 ms");
    await expect(
      page.getByRole("heading", { name: "What I did" }),
    ).toBeVisible();
    await expect(
      page.getByText("Designed the RAG pipeline", { exact: true }),
    ).toBeVisible();

    const story = page.getByRole("heading", { name: "Problem", exact: true });
    await expect(story).toBeHidden();
    await page.getByText("Engineering details").click();
    await expect(story).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("starts the demo from its building and slides the panel away on desktops", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "phones keep the panel under the scene",
    );
    const errors = collectPageErrors(page);
    await page.goto("/projects/knowledge-base");
    const bubble = page.locator('[data-anchored="true"]');
    await expect(bubble).toBeVisible({ timeout: 20_000 });
    await bubble.getByRole("textbox").fill("How do I get VPN access?");
    await bubble.getByRole("button", { name: "Ask" }).click();
    await expect(
      page.getByRole("region", { name: "Playback" }).locator("[aria-live]"),
    ).toContainText("RAG API");

    await page.getByRole("button", { name: "Hide the panel" }).click();
    await expect(
      page.getByRole("button", { name: "Show the panel" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-scene-host]")).toHaveAttribute(
      "data-focus-inset-lg",
      "76px",
    );
    await page.getByRole("button", { name: "Show the panel" }).click();
    await expect(page.locator("[data-scene-host]")).toHaveAttribute(
      "data-focus-inset-lg",
      "480px",
    );
    expect(errors).toEqual([]);
  });

  test("runs the case's own demo on its scene", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/projects/data-infrastructure");
    // The panel's button; on desktops the bubble over the web client offers the same read.
    const order = page
      .getByRole("region", { name: "Queries" })
      .getByRole("button", { name: "Order #42" });
    await order.click();
    await expect(page.getByRole("region", { name: "Playback" })).toContainText(
      "Redis",
    );
    await order.click();
    const stats = page.getByRole("region", { name: "The cache in numbers" });
    await expect(stats).toContainText("50");
    await expect(stats).toContainText("order:42");
    expect(errors).toEqual([]);
  });
});

/**
 * The form is controlled: text typed before hydration would be reset. It sets its start time right
 * after mounting, so a filled-in `startedAt` means the form is live.
 */
async function openContactForm(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('input[name="startedAt"]')).not.toHaveValue("");
}

test.describe("contact form", () => {
  test("points at the fields to fix before anything is sent", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await openContactForm(page, "/contact");
    const contact = page.getByLabel("Email or Telegram", { exact: true });
    const message = page.getByLabel("Message", { exact: true });
    await page.getByLabel("Name", { exact: true }).fill("Anna");
    await contact.fill("not a contact");
    await message.fill("Too short");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(contact).toHaveAttribute("aria-invalid", "true");
    await expect(contact).toHaveAccessibleDescription(
      "Please enter an email address or a Telegram handle like @username.",
    );
    await expect(message).toHaveAccessibleDescription(
      "Please write at least 20 characters.",
    );
    await contact.fill("@runtime_city");
    await expect(contact).toHaveAttribute("aria-invalid", "false");
    expect(errors).toEqual([]);
  });

  test("preselects the topic a link asked for", async ({ page }) => {
    await openContactForm(page, "/contact?topic=role");
    await expect(page.getByRole("radio", { name: "A role" })).toBeChecked();
    await openContactForm(page, "/contact?topic=nonsense");
    await expect(page.getByRole("radio", { name: "A project" })).toBeChecked();
  });

  test("answers a bot that filled the hidden field as if it was sent", async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await openContactForm(page, "/contact");
    await page.getByLabel("Name", { exact: true }).fill("Spam Bot");
    await page
      .getByLabel("Email or Telegram", { exact: true })
      .fill("bot@example.com");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Cheap followers, best price, click the link right now.");
    // The honeypot is off screen and out of the tab order; only a script fills it in.
    await page
      .locator('input[name="website"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "https://spam.example";
      });
    await page.getByRole("button", { name: "Send message" }).click();

    const status = page.getByRole("status");
    await expect(status).toContainText("your message has been sent");
    await status.getByRole("button", { name: "Send another message" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    expect(errors).toEqual([]);
  });
});

test.describe("seo", () => {
  test("sitemap lists root English URLs for every page", async ({
    request,
  }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of [
      "/expertise/automation",
      "/hire",
      "/for-employers",
      "/services/ai-rag",
    ])
      expect(sitemap).toContain(`${path}</loc>`);
    expect(sitemap).not.toMatch(/\/(ru|en)\//);
    expect(sitemap).not.toContain("hreflang");
  });

  test("a build that is not marked indexable stays out of search engines", async ({
    page,
    request,
  }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /");
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("pages carry a canonical URL, Open Graph and valid JSON-LD", async ({
    page,
  }) => {
    for (const path of [
      "/",
      "/hire",
      "/services/python-backend",
      "/projects/knowledge-base",
    ]) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
        "href",
        // The home page's canonical is the bare origin.
        path === "/" ? /^https?:\/\/[^/]+\/?$/ : new RegExp(`${path}$`),
      );
      await expect(page.locator('meta[property="og:image"]'), path).toHaveCount(
        1,
      );
      const blocks = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      expect(blocks.length, path).toBeGreaterThan(0);
      for (const block of blocks) {
        const data = JSON.parse(block) as { "@context"?: string };
        expect(data["@context"]).toBe("https://schema.org");
      }
    }
  });
});
