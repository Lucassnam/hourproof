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
    // NEXT_PUBLIC_HOURPROOF_BACKEND must be set before `next build` (it's
    // inlined into the client bundle at build time, not read at request
    // time), so it's set on the build step too, not just start:e2e.
    // HOURPROOF_MOCK_SHIFTS=1 is what makes /api/mock-shifts respond instead
    // of 404ing, and unlocks its e2e-only reset/x-hp-now extras.
    command:
      "HOURPROOF_MOCK_SHIFTS=1 NEXT_PUBLIC_HOURPROOF_BACKEND=mock npm run build && HOURPROOF_MOCK_SHIFTS=1 NEXT_PUBLIC_HOURPROOF_BACKEND=mock npm run start:e2e",
    port: 7051,
    // Always start a fresh server for this run. `reuseExistingServer: true`
    // (the old local-dev default) let e2e silently test whatever was already
    // listening on the port — including a stale build from a previous session —
    // instead of the build this run just produced. Fix round 1, 2026-09-25.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  // The preset is spread first and the phone viewport set after it: the Desktop Chrome
  // preset carries its own 1280x720 viewport, which used to override the 360px one above
  // for every spec (Task 4 fix round 1, ruling 4).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 } } }],
});
