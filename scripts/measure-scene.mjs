// Measures the scene in Google Chrome: frame times, WebGL draw calls per frame and main-thread
// cost, unthrottled and with 4x CPU slowdown (a mid-range Android proxy). The hero is measured
// idle; the playground with a rate-limit burst and a dead-letter run in flight at the same time.
//
// Usage: npm run build && npm run start, then in another terminal:
//   npm run perf:scene              (http://localhost:3000)
//   npm run perf:scene -- <baseUrl>
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const SAMPLE_MS = 6000;

/** Runs in the page before any script: counts draw calls by wrapping the WebGL context methods. */
function instrumentWebGL() {
  window.__scenePerf = { draws: 0, renderer: "" };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    const context = getContext.call(this, type, options);
    if (
      context &&
      (type === "webgl2" || type === "webgl") &&
      !context.__instrumented
    ) {
      context.__instrumented = true;
      for (const name of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const method = context[name];
        if (typeof method !== "function") continue;
        context[name] = function (...args) {
          window.__scenePerf.draws++;
          return method.apply(this, args);
        };
      }
      const info = context.getExtension("WEBGL_debug_renderer_info");
      if (info)
        window.__scenePerf.renderer = context.getParameter(
          info.UNMASKED_RENDERER_WEBGL,
        );
    }
    return context;
  };
}

/** Fires the two busiest playground scenarios so packets, cards and pulses overlap. */
async function startPlaygroundRuns(page) {
  for (const scenario of ["Rate limit", "Dead letter queue"]) {
    await page.getByText(scenario, { exact: true }).click();
    await page.getByRole("button", { name: /^Send/ }).click();
  }
}

async function measure(
  browser,
  { name, viewport, mobile, cpuThrottle, path = "/", prepare },
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2.625 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "ru-RU",
  });
  const page = await context.newPage();
  await page.addInitScript(instrumentWebGL);
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.locator("[data-scene-host] canvas").waitFor({ timeout: 30_000 });
  await page.locator("[data-scene-host]").scrollIntoViewIfNeeded();

  const session = await context.newCDPSession(page);
  if (cpuThrottle)
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  await page.waitForTimeout(3000);
  if (prepare) {
    await prepare(page);
    await page.locator("[data-scene-host]").scrollIntoViewIfNeeded();
  }
  await session.send("Performance.enable");
  const metric = (metrics, key) =>
    metrics.find((entry) => entry.name === key)?.value ?? 0;
  const before = (await session.send("Performance.getMetrics")).metrics;

  const sample = await page.evaluate(
    (durationMs) =>
      new Promise((resolve) => {
        const deltas = [];
        const draws = [];
        const start = performance.now();
        let last = start;
        window.__scenePerf.draws = 0;
        requestAnimationFrame(function frame(now) {
          deltas.push(now - last);
          draws.push(window.__scenePerf.draws);
          window.__scenePerf.draws = 0;
          last = now;
          if (now - start < durationMs) requestAnimationFrame(frame);
          else
            resolve({
              deltas: deltas.slice(1),
              draws: draws.slice(1),
              renderer: window.__scenePerf.renderer,
            });
        });
      }),
    SAMPLE_MS,
  );

  const after = (await session.send("Performance.getMetrics")).metrics;
  const seconds = metric(after, "Timestamp") - metric(before, "Timestamp");
  const perSecond = (key) =>
    ((metric(after, key) - metric(before, key)) * 1000) / seconds;
  const sorted = [...sample.deltas].sort((a, b) => a - b);
  const average =
    sample.deltas.reduce((sum, value) => sum + value, 0) / sample.deltas.length;
  const renderedFrames = sample.draws.filter((value) => value > 0);
  const drawsPerFrame = renderedFrames.length
    ? Math.round(
        renderedFrames.reduce((sum, value) => sum + value, 0) /
          renderedFrames.length,
      )
    : 0;

  console.log(
    [
      name.padEnd(16),
      `frame avg ${average.toFixed(1)} ms`,
      `p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms`,
      `max ${sorted.at(-1).toFixed(1)} ms`,
      `>50 ms: ${sample.deltas.filter((value) => value > 50).length}`,
      `draws/frame ${drawsPerFrame}`,
      `script ${perSecond("ScriptDuration").toFixed(0)} ms/s`,
      `tasks ${perSecond("TaskDuration").toFixed(0)} ms/s`,
    ].join(" | "),
  );
  await context.close();
  return sample.renderer;
}

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  args: [
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const renderer = await measure(browser, {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
  });
  console.log(`GPU: ${renderer || "unknown"}`);
  await measure(browser, {
    name: "desktop cpu x4",
    viewport: { width: 1440, height: 900 },
    cpuThrottle: 4,
  });
  await measure(browser, {
    name: "mobile cpu x4",
    viewport: { width: 412, height: 915 },
    mobile: true,
    cpuThrottle: 4,
  });
  await measure(browser, {
    name: "playground x4",
    viewport: { width: 1440, height: 900 },
    cpuThrottle: 4,
    path: "/architecture",
    prepare: startPlaygroundRuns,
  });
  await measure(browser, {
    name: "pg mobile x4",
    viewport: { width: 412, height: 915 },
    mobile: true,
    cpuThrottle: 4,
    path: "/architecture",
    prepare: startPlaygroundRuns,
  });
} finally {
  await browser.close();
}
