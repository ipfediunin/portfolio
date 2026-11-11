// Captures a still frame of every published case's world for its card in the case list
// (public/cases/<slug>.jpg): the cards show the real city of the case instead of a flat outline.
// The page runs with reduced motion, so the engine draws one still frame: no traffic, no cards.
//
// Usage: npm run build && npm run start, then in another terminal:
//   npm run posters:cases              (http://localhost:3000)
//   npm run posters:cases -- <baseUrl>
// Rerun after changing a case world (src/simulation/cases/<slug>/graph.ts) or the look of the scene.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const outDir = fileURLToPath(new URL("../public/cases/", import.meta.url));
/** Below the `lg` breakpoint the case scene is a 4:3 slot, the shape of a card's thumbnail. */
const VIEWPORT = { width: 960, height: 1100 };
const SCALE = 1.5;
/** Time for the engine to bake its art and for status cards to finish fading in. */
const SETTLE_MS = 3500;
/** The slot's rounded-3xl corners (CSS pixels). */
const CORNER_PX = 24;

/** Published cases, as the production sitemap lists them (drafts are not in it). */
async function publishedCases() {
  const response = await fetch(`${baseUrl}/sitemap.xml`);
  if (!response.ok)
    throw new Error(
      `sitemap.xml answered ${response.status}: is the server running?`,
    );
  const xml = await response.text();
  const slugs = [
    ...xml.matchAll(/<loc>[^<]*\/projects\/([a-z0-9-]+)<\/loc>/g),
  ].map((match) => match[1]);
  if (slugs.length === 0) throw new Error("The sitemap lists no case studies");
  return slugs;
}

async function capture(browser, slug) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/projects/${slug}`, {
      waitUntil: "networkidle",
    });
    const host = page.locator("[data-scene-host]").first();
    await host.scrollIntoViewIfNeeded();
    await host.locator("canvas").waitFor({ timeout: 20_000 });
    // The slot fades the live scene in once the engine has drawn it.
    await page.waitForFunction(
      () => {
        const element = document.querySelector("[data-scene-host]");
        return element !== null && getComputedStyle(element).opacity === "1";
      },
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(SETTLE_MS);
    if (errors.length > 0) throw new Error(errors.join("; "));
    const box = await host.boundingBox();
    if (!box) throw new Error("The scene slot is not on screen");
    const path = `${outDir}${slug}.jpg`;
    // Inset by the slot's corner radius: the thumbnail has corners of its own.
    await page.screenshot({
      path,
      type: "jpeg",
      quality: 88,
      clip: {
        x: box.x + CORNER_PX,
        y: box.y + CORNER_PX,
        width: box.width - CORNER_PX * 2,
        height: box.height - CORNER_PX * 2,
      },
    });
    console.log(`  ${slug} → public/cases/${slug}.jpg`);
  } finally {
    await context.close();
  }
}

await mkdir(outDir, { recursive: true });
const slugs = await publishedCases();
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  args: [
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  console.log(`Capturing ${slugs.length} case worlds from ${baseUrl}`);
  for (const slug of slugs) await capture(browser, slug);
} finally {
  await browser.close();
}
