import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:7050",
    viewport: { width: 360, height: 740 },
  },
  webServer: {
    command: "npm run build && npm start",
    port: 7050,
    // Always start a fresh server for this run. `reuseExistingServer: true`
    // (the old local-dev default) let e2e silently test whatever was already
    // listening on :7050 — including a stale build from a previous session —
    // instead of the build this run just produced. Fix round 1, 2026-09-25.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
