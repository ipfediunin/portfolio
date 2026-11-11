import { defineConfig, devices } from "@playwright/test";

// E2E_PORT: Windows may reserve 3100 for Hyper-V/WinNAT (`netsh interface ipv4 show
// excludedportrange protocol=tcp`); pick a free port then.
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

/** Smoke tests against a production build, the same artifact that gets deployed. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "en-US",
    trace: "on-first-retry",
    // Locally the installed Google Chrome is used (no browser download needed);
    // CI runs `npx playwright install chromium` and uses the bundled build.
    // Override with PLAYWRIGHT_CHANNEL=msedge, or an empty value for the bundled Chromium.
    channel:
      process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : "chrome"),
    // Headless Chromium has no GPU; SwiftShader gives the scene a software WebGL context.
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: `${baseURL}/robots.txt`,
    // A well-formed but fake bot, so the contact form is built in. The tests only take paths that
    // never reach Telegram: validation in the browser and the honeypot.
    env: {
      TELEGRAM_BOT_TOKEN: "100000:e2e-fake-token-never-delivered",
      TELEGRAM_CHAT_ID: "1",
      // A live API that only exists inside the tests: they answer its requests with page.route.
      NEXT_PUBLIC_LIVE_API_URL: "http://live-api.test",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
