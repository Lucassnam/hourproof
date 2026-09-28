import { expect, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

// Shared helpers for specs that run against the in-memory mock backend (playwright.config.ts
// builds with NEXT_PUBLIC_HOURPROOF_BACKEND=mock and serves /api/mock-shifts with
// HOURPROOF_MOCK_SHIFTS=1). Not a spec: Playwright only runs *.spec.ts.
//
// The mock keeps one world per namespace (the x-hp-mock-ns header). Every test gets its own
// namespace, which the pages' mock client reads from localStorage (set by an init script
// before any page code runs) and the tests' own API calls send directly. So mock-backed
// tests run in parallel without seeing each other's kitchens, shifts or PIN lockouts. A
// volunteer's phone and a supervisor's tablet in the same test join the same namespace.

export const MOCK_NS_KEY = "hp.shifts.mockNs";

export function namespaceFor(testInfo: TestInfo): string {
  return `e2e-${testInfo.testId}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
}

// Every page this page/context opens uses the namespace `ns`.
export async function joinNamespace(target: Page | BrowserContext, ns: string): Promise<void> {
  await target.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // about:blank has no storage; the real page load runs this again.
      }
    },
    { key: MOCK_NS_KEY, value: ns },
  );
}

// A fresh seed for this namespace only (always with the second kitchen).
export async function resetMockWorld(request: APIRequestContext, ns: string): Promise<void> {
  const res = await request.post("/api/mock-shifts", {
    data: { op: "reset", args: { seedSecondKitchen: true } },
    headers: { "x-hp-mock-ns": ns },
  });
  expect(res.ok()).toBe(true);
}

// e2e-only time travel: every mock call from this page carries x-hp-now (the mock route
// honors it only when HOURPROOF_MOCK_SHIFTS=1), so the server thinks it's `at`.
export async function serverTimeIs(page: Page, at: Date): Promise<void> {
  await page.unroute("**/api/mock-shifts");
  await page.route("**/api/mock-shifts", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-hp-now": at.toISOString() } }),
  );
}

// A mock call straight to the route, as volunteer `volunteerId` (a stand-in phone), at
// server time `at` if given.
export async function mockCall<T>(
  request: APIRequestContext,
  ns: string,
  op: string,
  args: Record<string, unknown>,
  opts: { volunteerId?: string; at?: Date } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-hp-mock-ns": ns };
  if (opts.volunteerId) headers["x-hp-volunteer"] = opts.volunteerId;
  if (opts.at) headers["x-hp-now"] = opts.at.toISOString();
  const res = await request.post("/api/mock-shifts", { data: { op, args }, headers });
  const body = (await res.json()) as { result?: T; error?: string };
  expect(res.ok(), `mock ${op} failed: ${body.error}`).toBe(true);
  return body.result as T;
}
