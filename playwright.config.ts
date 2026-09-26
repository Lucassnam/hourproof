import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    // e2e has its own port (7051) so it can run while `npm run dev` holds 7050.
    baseURL: "http://localhost:7051",
    viewport: { width: 360, height: 740 },
  },
  webServer: {
    command: "npm run build && npm run start:e2e",
    port: 7051,
    // Always start a fresh server for this run. `reuseExistingServer: true`
    // (the old local-dev default) let e2e silently test whatever was already
    // listening on the port — including a stale build from a previous session —
    // instead of the build this run just produced. Fix round 1, 2026-09-25.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
