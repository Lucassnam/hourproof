import { test, expect, type Page } from "@playwright/test";
import { joinNamespace, mockCall, namespaceFor, resetMockWorld, serverTimeIs } from "./mock-world";

// Kitchen shifts in the hour log and on the proof page, against the in-memory mock backend.
// The clock is fixed (page and mock server alike) so the shift's date, the log's month and
// "today" never depend on when the suite runs.

const SLUG = "test-kitchen";
const PIN = "123456";
const CODE = "TESTCODE-0000000000000";
const KITCHEN = "Community Kitchen (test)";

// 1:00 p.m. in California on a mid-month day.
const NOW = new Date("2026-10-15T20:00:00.000Z");
const STARTED = new Date(NOW.getTime() - (3 * 60 + 12) * 60 * 1000);

type ApiShift = { id: string; status: string };

let ns = "default";

test.beforeEach(async ({ page, request }, testInfo) => {
  ns = namespaceFor(testInfo);
  await joinNamespace(page, ns);
  await resetMockWorld(request, ns);
  await page.clock.setFixedTime(NOW);
});

function ring(page: Page) {
  return page.getByRole("img", { name: /of 80 hours/ });
}

function savedRows(page: Page) {
  return page.getByRole("region", { name: "Saved hours" }).getByRole("listitem");
}

async function addHours(page: Page, { type, hours }: { type: RegExp; hours: string }) {
  await page.getByRole("button", { name: "Add hours", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add hours" })).toBeVisible();
  await page.getByRole("radio", { name: type }).check();
  await page.getByLabel("How many hours?").fill(hours);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

// Check in 3 h 12 min ago and check out now, on this phone.
async function workAShift(page: Page): Promise<string> {
  await serverTimeIs(page, STARTED);
  await page.goto(`/k/${CODE}`);
  await page.getByLabel("Your first name or nickname").fill("Maria");
  await page.getByRole("button", { name: `Check in at ${KITCHEN}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  await serverTimeIs(page, NOW);
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked out" })).toBeVisible();
  const volunteerId = await page.evaluate(() => localStorage.getItem("hp.shifts.mockVolunteerId"));
  expect(volunteerId).toBeTruthy();
  return volunteerId!;
}

test("a kitchen shift shows in the log as waiting, then as verified once a supervisor confirms, and reaches the proof page", async ({
  page,
  request,
}) => {
  const volunteerId = await workAShift(page);

  // "See my hours" from the checked-out screen: the shift is already in the log.
  await page.getByRole("link", { name: "See my hours" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
  // 3 h 12 min rounds down to 3 hours, and a waiting shift counts as the person's own log.
  await expect(ring(page)).toHaveAttribute("aria-label", "3 of 80 hours this month");
  await expect(savedRows(page)).toHaveCount(1);
  await expect(savedRows(page).first()).toContainText("Volunteering");
  await expect(savedRows(page).first()).toContainText("3 hours");
  await expect(savedRows(page).first()).toContainText(KITCHEN);
  await expect(page.getByTestId("shift-status")).toHaveText("Waiting for the kitchen to confirm");
  // The kitchen's record can't be edited from the log.
  await expect(savedRows(page).first().getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("ring-legend")).toHaveCount(0);
  await expect(page.getByText("Kitchen shifts come from the kitchen's records.")).toBeVisible();

  // The supervisor confirms (straight through the mock, as the dashboard would).
  const [shift] = await mockCall<ApiShift[]>(request, ns, "myShifts", { sinceDate: "2026-01-01" }, { volunteerId, at: NOW });
  await mockCall(request, ns, "decide", { slug: SLUG, pin: PIN, shiftId: shift.id, decision: "confirm", supervisor: "Sam" }, { at: NOW });

  await page.reload();
  await expect(page.getByTestId("shift-status")).toHaveText("Verified by Sam");
  await expect(ring(page)).toHaveAttribute("aria-label", "3 of 80 hours this month. 3 of them verified by a kitchen.");
  await expect(page.getByTestId("ring-legend")).toContainText("Verified by a kitchen");
  await expect(page.getByTestId("ring-legend")).toContainText("From your own log");

  // Hours the person logs themselves draw as the striped part of the ring.
  await addHours(page, { type: /^Paid work/, hours: "5" });
  await expect(ring(page)).toHaveAttribute("aria-label", "8 of 80 hours this month. 3 of them verified by a kitchen.");
  await expect(page.getByTestId("ring-verified")).toHaveCount(1);
  await expect(page.getByTestId("ring-own")).toHaveCount(1);
  await expect(savedRows(page)).toHaveCount(2);

  // Logging the same volunteering by hand as well gets a gentle note, and nothing is blocked.
  await expect(page.getByTestId("duplicate-note")).toHaveCount(0);
  await addHours(page, { type: /^Volunteering/, hours: "3" });
  await expect(page.getByTestId("duplicate-note")).toHaveText(
    "You may have logged a kitchen shift twice on Thursday, October 15. If so, delete your own entry.",
  );

  // The proof page counts the shift, says who verified it, and still offers the signed form.
  await page.goto("/proof");
  const volunteer = page.getByTestId("proof-volunteer");
  await expect(volunteer).toContainText("6 hours logged");
  await expect(volunteer.getByTestId("kitchen-verified")).toContainText(`A supervisor at ${KITCHEN} (Sam) verified 3 hours of these in HourProof.`);
  await expect(volunteer.getByTestId("kitchen-verified")).toContainText("Your county still needs a signed form like the CF 888");
  await expect(volunteer.getByRole("button", { name: `Fill a CF 888 for ${KITCHEN}` })).toBeVisible();
});

test("the shifts stay on screen with no signal, from the copy kept on the phone", async ({ page }) => {
  await workAShift(page);
  await page.goto("/log");
  await expect(page.getByTestId("shift-status")).toHaveText("Waiting for the kitchen to confirm");

  // The server stops answering.
  await page.unroute("**/api/mock-shifts");
  await page.route("**/api/mock-shifts", (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId("shift-status")).toHaveText("Waiting for the kitchen to confirm");
  await expect(ring(page)).toHaveAttribute("aria-label", "3 of 80 hours this month");
  await expect(page.getByTestId("shift-sync-failed")).toHaveText(
    "Couldn't update your kitchen shifts. These are the last ones saved on this phone.",
  );
});

test("someone who never checked in at a kitchen never contacts the server from the log or the proof page", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/mock-shifts")) calls.push(r.url());
  });
  await page.goto("/log");
  await addHours(page, { type: /^Paid work/, hours: "4" });
  await expect(ring(page)).toHaveAttribute("aria-label", "4 of 80 hours this month");
  await page.goto("/proof");
  await expect(page.getByTestId("proof-work")).toContainText("4 hours logged");
  // Give a stray background request time to show up before asserting there was none.
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});

test("the demo shows a verified kitchen shift and a waiting one, without any network call", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/mock-shifts")) calls.push(r.url());
  });
  // Late in the month the demo has both of its volunteering entries (mid-month it has one).
  await page.clock.setFixedTime(new Date("2026-10-28T20:00:00.000Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("region", { name: "Demo — sample data, not yours." })).toBeVisible();

  await expect(page.getByTestId("ring-legend")).toBeVisible();
  await expect(ring(page)).toHaveAttribute("aria-label", /of 80 hours this month\. [\d.]+ of them verified by a kitchen\.$/);
  await expect(page.getByTestId("shift-status").filter({ hasText: "Verified by Rosa" })).toHaveCount(1);
  await expect(page.getByTestId("shift-status").filter({ hasText: "Waiting for the kitchen to confirm" })).toHaveCount(1);
  await expect(page.getByText("Community kitchen").first()).toBeVisible();

  await page.goto("/proof");
  await expect(page.getByTestId("kitchen-verified")).toContainText("A supervisor at Community kitchen (Rosa) verified");
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});
