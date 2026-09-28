import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { joinNamespace, namespaceFor, resetMockWorld, serverTimeIs } from "./mock-world";

// Volunteer check-in page (/k/<code>, Phase 3, Task 4), against the in-memory mock backend
// (playwright.config.ts builds with NEXT_PUBLIC_HOURPROOF_BACKEND=mock and serves the mock
// route with HOURPROOF_MOCK_SHIFTS=1). Each Playwright context is a fresh "phone": its own
// localStorage, so its own mock volunteer id.
//
// The mock keeps one world per namespace (the x-hp-mock-ns header). Every test gets its own
// namespace, which the page's mock client reads from localStorage (set by an init script
// before any page code runs) and the test's own API calls send directly. So tests here run
// in parallel, with each other and with other mock-backed specs, and each reset (always
// seeding the second kitchen) touches only its own world.

const KITCHEN = "Community Kitchen (test)";
const CODE = "TESTCODE-0000000000000";
const KITCHEN_2 = "Community Kitchen 2 (test)";
const CODE_2 = "TESTCODE2-00000000000";

const HOUR = 60 * 60 * 1000;

// Set per test in beforeEach. Tests in one worker run one at a time, so a module variable is
// enough; different workers are different processes.
let ns = "default";

// The namespace helpers live in ./mock-world.ts, shared with the kitchen dashboard's spec.
async function resetMock(request: APIRequestContext) {
  await resetMockWorld(request, ns);
}

test.beforeEach(async ({ page, request }, testInfo) => {
  ns = namespaceFor(testInfo);
  await joinNamespace(page, ns);
  await resetMock(request);
});

function checkInButton(page: Page, kitchen = KITCHEN) {
  return page.getByRole("button", { name: `Check in at ${kitchen}` });
}

async function gotoKitchen(page: Page, code = CODE) {
  await page.goto(`/k/${code}`);
}

async function firstCheckIn(page: Page, name = "Maria", code = CODE, kitchen = KITCHEN) {
  await gotoKitchen(page, code);
  await expect(page.getByRole("heading", { level: 1, name: kitchen })).toBeVisible();
  await page.getByLabel("Your first name or nickname").fill(name);
  await checkInButton(page, kitchen).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
}

async function myShifts(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("hp.shifts.mockVolunteerId"));
  expect(id).toBeTruthy();
  const res = await page.request.post("/api/mock-shifts", {
    data: { op: "myShifts", args: { sinceDate: "2000-01-01" } },
    headers: { "x-hp-volunteer": id!, "x-hp-mock-ns": ns },
  });
  return ((await res.json()) as { result: { id: string; status: string; checkIn: string; autoClosed: boolean }[] }).result;
}

test("1. first check-in: the privacy line shows first, Check in needs a name, and the name is remembered", async ({ page }) => {
  // Every spec runs on a phone-width screen (playwright.config.ts; this file doesn't set it).
  expect(page.viewportSize()).toEqual({ width: 360, height: 740 });
  await page.clock.install();
  await gotoKitchen(page);
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  await expect(page.getByTestId("privacy")).toHaveText(
    `Your first name and your check-in and check-out times go to ${KITCHEN} so a supervisor can confirm your hours. Nothing else leaves your phone.`,
  );
  await expect(page.getByTestId("consent")).toHaveText("Tapping Check in means you agree.");
  // The privacy line and the consent sentence sit above the button, so they're read first.
  const privacyBox = await page.getByTestId("privacy").boundingBox();
  const buttonBox = await checkInButton(page).boundingBox();
  expect(privacyBox!.y).toBeLessThan(buttonBox!.y);

  const name = page.getByLabel("Your first name or nickname");
  await expect(checkInButton(page)).toBeDisabled();
  await name.fill("   ");
  await expect(checkInButton(page)).toBeDisabled();
  await name.fill("Maria");
  await expect(checkInButton(page)).toBeEnabled();
  await checkInButton(page).click();

  const heading = page.getByRole("heading", { level: 1, name: "You're checked in" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByTestId("checked-in-at")).toHaveText(/^Checked in at \d{1,2}:\d{2}\s[AP]M$/);
  await expect(page.getByTestId("elapsed")).toHaveText("0 minutes so far");
  await expect(page.getByRole("button", { name: "Check out" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("hp.checkin.name"))).toBe("Maria");
  // The agreement is kept on this phone only, as the time it was given.
  const agreedAt = await page.evaluate(() => localStorage.getItem("hp.checkin.privacyShown"));
  expect(Number.isNaN(Date.parse(agreedAt ?? ""))).toBe(false);
  await expect(page.getByTestId("consent")).toHaveCount(0);

  // The live counter moves every 30 seconds.
  await page.clock.fastForward("30:00");
  await expect(page.getByTestId("elapsed")).toHaveText(/^(29|30) minutes so far$/);

  // The mock recorded exactly what the privacy line says: the name and a time.
  const shifts = await myShifts(page);
  expect(shifts).toHaveLength(1);
  expect(shifts[0].status).toBe("open");
});

test("2. checking in again is idempotent: a reload shows the same shift, and a second tap makes no new one", async ({ page }) => {
  await firstCheckIn(page);
  const checkedInAt = await page.getByTestId("checked-in-at").innerText();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  await expect(page.getByTestId("checked-in-at")).toHaveText(checkedInAt);

  // Storage that lost the "already checked in" flag (but kept the volunteer id) shows the
  // Check in button again; tapping it returns the same open shift.
  await page.evaluate(() => localStorage.removeItem("hp.checkin.privacyShown"));
  await page.reload();
  await expect(page.getByLabel("Your first name or nickname")).toHaveValue("Maria");
  await checkInButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  await expect(page.getByTestId("checked-in-at")).toHaveText(checkedInAt);

  const shifts = await myShifts(page);
  expect(shifts).toHaveLength(1);
  expect(shifts[0].status).toBe("open");
});

test("3. check out: hours are rounded down and sent for confirmation; the next visit remembers the name", async ({ page }) => {
  await firstCheckIn(page);
  const [shift] = await myShifts(page);
  // Check out 3 h 12 min after check-in: that's 3 hours, never 3.25.
  await serverTimeIs(page, new Date(Date.parse(shift.checkIn) + 3 * HOUR + 12 * 60 * 1000));
  await page.getByRole("button", { name: "Check out" }).click();

  const heading = page.getByRole("heading", { level: 1, name: "You're checked out" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByTestId("sent")).toHaveText(
    new RegExp(`^Sent to ${KITCHEN.replace(/[()]/g, "\\$&")} for confirmation: 3 hours \\(\\d{1,2}:\\d{2}\\s[AP]M–\\d{1,2}:\\d{2}\\s[AP]M\\)\\.$`),
  );
  await expect(page.getByText("It shows in your hours now and becomes verified when a supervisor confirms.")).toBeVisible();
  await expect(page.getByTestId("auto-closed")).toHaveCount(0);
  const seeHours = page.getByRole("link", { name: "See my hours" });
  await expect(seeHours).toHaveAttribute("href", "/log");

  const shifts = await myShifts(page);
  expect(shifts.map((s) => s.status)).toEqual(["pending"]);

  // Next visit: not checked in, the name is remembered and can be changed.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  await expect(page.getByText("Checking in as Maria")).toBeVisible();
  await expect(page.getByLabel("Your first name or nickname")).toHaveCount(0);
  await page.getByRole("button", { name: "Change name" }).click();
  const name = page.getByLabel("Your first name or nickname");
  await expect(name).toBeFocused();
  await name.fill("Mari");
  await checkInButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("hp.checkin.name"))).toBe("Mari");

  await seeHoursWorks(page);
});

async function seeHoursWorks(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: "Check out" }).click();
  await page.getByRole("link", { name: "See my hours" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

test("3b. a check-out that landed late (weak signal, then a retry) still shows its real summary", async ({ page }) => {
  await firstCheckIn(page);
  const [shift] = await myShifts(page);
  const id = await page.evaluate(() => localStorage.getItem("hp.shifts.mockVolunteerId"));
  // The page's first check-out reached the server at +2 h 40 min, but the answer never got
  // back. Simulated by closing the shift straight through the mock.
  const res = await page.request.post("/api/mock-shifts", {
    data: { op: "checkOut", args: { code: CODE } },
    headers: { "x-hp-volunteer": id!, "x-hp-mock-ns": ns, "x-hp-now": new Date(Date.parse(shift.checkIn) + 2 * HOUR + 40 * 60 * 1000).toISOString() },
  });
  expect(res.ok()).toBe(true);

  // The volunteer taps Check out again: the server says nothing is open, and the page finds
  // the shift that did close instead of saying "You're not checked in here".
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked out" })).toBeVisible();
  await expect(page.getByTestId("sent")).toHaveText(
    new RegExp(`^Sent to ${KITCHEN.replace(/[()]/g, "\\$&")} for confirmation: 2\\.5 hours \\(\\d{1,2}:\\d{2}\\s[AP]M–\\d{1,2}:\\d{2}\\s[AP]M\\)\\.$`),
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("3c. check-out when nothing closed here says so plainly", async ({ page }) => {
  await firstCheckIn(page);
  const id = await page.evaluate(() => localStorage.getItem("hp.shifts.mockVolunteerId"));
  // The server has no record of any shift for this phone (this test wipes its mock world).
  await resetMock(page.request);
  expect(id).toBeTruthy();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "You're not checked in here. Your shift may have closed already.",
  );
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
});

test("4. checked in at another kitchen: no second open shift, and the page says where", async ({ page }) => {
  await firstCheckIn(page, "Ana", CODE_2, KITCHEN_2);

  await gotoKitchen(page, CODE);
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in somewhere else" })).toBeVisible();
  await expect(page.getByText(`You're checked in at ${KITCHEN_2}. Check out there first.`)).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See my hours" })).toHaveAttribute("href", "/log");

  // Even when this device forgot it had checked in, tapping Check in here is refused.
  await page.evaluate(() => localStorage.removeItem("hp.checkin.privacyShown"));
  await page.reload();
  await checkInButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in somewhere else" })).toBeVisible();

  const shifts = await myShifts(page);
  expect(shifts.filter((s) => s.status === "open")).toHaveLength(1);
});

test("5. an unknown code says the poster isn't active", async ({ page }) => {
  await gotoKitchen(page, "NOT-A-REAL-CODE-000000");
  await expect(page.getByRole("heading", { level: 1, name: "This QR code isn't active" })).toBeVisible();
  await expect(page.getByText("Ask the kitchen for the current poster.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("6. forgot to check out: 9 hours later the shift is closed at 8 hours and the page says so once", async ({ page }) => {
  await firstCheckIn(page);
  const [shift] = await myShifts(page);
  await serverTimeIs(page, new Date(Date.parse(shift.checkIn) + 9 * HOUR));
  await page.reload();

  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  await expect(page.getByTestId("auto-closed")).toHaveText(
    "It looks like you forgot to check out. We closed your shift at 8 hours. The supervisor can fix the time.",
  );
  const [closed] = await myShifts(page);
  expect(closed).toMatchObject({ status: "pending", autoClosed: true });

  // Checking in again moves past the notice; it doesn't come back.
  await checkInButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked out" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  await expect(page.getByTestId("auto-closed")).toHaveCount(0);
});

test("7. Spanish: every screen is in Spanish, with 24-hour California times", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "es", domain: "localhost", path: "/" }]);
  await gotoKitchen(page);
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  await expect(page.getByTestId("privacy")).toHaveText(
    `Su nombre y sus horas de entrada y salida se envían a ${KITCHEN} para que un supervisor confirme sus horas. Nada más sale de su teléfono.`,
  );
  await expect(page.getByTestId("consent")).toHaveText("Al tocar Registrar entrada, usted acepta.");
  const button = page.getByRole("button", { name: `Registrar entrada en ${KITCHEN}` });
  await expect(button).toBeDisabled();
  await page.getByLabel("Su nombre o apodo").fill("Lupe");
  await button.click();

  await expect(page.getByRole("heading", { level: 1, name: "Su entrada está registrada" })).toBeVisible();
  await expect(page.getByTestId("checked-in-at")).toHaveText(/^Entrada: \d{1,2}:\d{2}$/);
  await expect(page.getByTestId("elapsed")).toHaveText("0 minutos hasta ahora");

  const [shift] = await myShifts(page);
  await serverTimeIs(page, new Date(Date.parse(shift.checkIn) + 2 * HOUR + 20 * 60 * 1000));
  await page.getByRole("button", { name: "Registrar salida" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Su salida está registrada" })).toBeVisible();
  await expect(page.getByTestId("sent")).toHaveText(
    new RegExp(`^Enviado a ${KITCHEN.replace(/[()]/g, "\\$&")} para confirmar: 2,25 horas \\(\\d{1,2}:\\d{2}–\\d{1,2}:\\d{2}\\)\\.$`),
  );
  await expect(page.getByRole("link", { name: "Ver mis horas" })).toBeVisible();
  const text = await page.getByRole("main").innerText();
  expect(text).not.toMatch(/\b(hours|Check|Sent|Your|See|confirmation)\b/);
});

test("8. no signal: loading and checking in both say so plainly, and Try again recovers", async ({ page }) => {
  await page.route("**/api/mock-shifts", (route) => route.abort("internetdisconnected"));
  await gotoKitchen(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("No signal. Try again when you're connected.");
  await page.unroute("**/api/mock-shifts");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();

  await page.getByLabel("Your first name or nickname").fill("Maria");
  await page.route("**/api/mock-shifts", (route) => route.abort("internetdisconnected"));
  await checkInButton(page).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("No signal. Try again when you're connected.");
  await expect(checkInButton(page)).toBeEnabled();
  await page.unroute("**/api/mock-shifts");
  await checkInButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
});

// Screenshots of every state at 360 px, light/dark, en/es, into docs/screenshots/phase3/.
// Run with HP_SCREENSHOTS=1 (off by default so a normal e2e run doesn't rewrite them).
test.describe("screenshots", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const lang of ["en", "es"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`screenshots: every state, ${lang}, ${theme}`, async ({ page, context, request }) => {
        test.skip(!process.env.HP_SCREENSHOTS, "set HP_SCREENSHOTS=1 to write screenshots");
        test.setTimeout(120_000);
        await context.addCookies([{ name: "NEXT_LOCALE", value: lang, domain: "localhost", path: "/" }]);
        if (theme === "dark") await page.addInitScript(() => localStorage.setItem("theme", "dark"));
        const shot = (state: string) =>
          page.screenshot({ path: `docs/screenshots/phase3/checkin-${state}-${lang}-${theme}.png`, fullPage: true, animations: "disabled" });
        const h1 = page.getByRole("heading", { level: 1 });
        const nameField = page.locator("#checkin-name");
        const primary = page.getByRole("main").locator('button[type="submit"], button.bg-signal').first();

        // Loading: hold the first mock call.
        let release: () => void = () => {};
        const held = new Promise<void>((r) => (release = r));
        await page.route("**/api/mock-shifts", async (route) => {
          await held;
          await route.continue();
        });
        await gotoKitchen(page);
        await expect(page.getByRole("status")).toBeVisible();
        await shot("1-loading");
        release();
        await expect(h1).toHaveText(KITCHEN);
        await page.unroute("**/api/mock-shifts");
        await shot("2-first-time");
        await nameField.fill("Maria");
        await shot("3-first-time-named");
        await primary.click();
        await expect(page.getByTestId("elapsed")).toBeVisible();
        await shot("4-checked-in");

        const [shift] = await myShifts(page);
        await serverTimeIs(page, new Date(Date.parse(shift.checkIn) + 3 * HOUR + 12 * 60 * 1000));
        await primary.click();
        await expect(page.getByTestId("sent")).toBeVisible();
        await shot("5-checked-out");

        await page.reload();
        await expect(h1).toHaveText(KITCHEN);
        await shot("6-returning");

        await page.unroute("**/api/mock-shifts");
        await primary.click();
        await expect(page.getByTestId("elapsed")).toBeVisible();
        const shifts = await myShifts(page);
        const open = shifts.find((s) => s.status === "open")!;
        await serverTimeIs(page, new Date(Date.parse(open.checkIn) + 9 * HOUR));
        await page.reload();
        await expect(page.getByTestId("auto-closed")).toBeVisible();
        await shot("7-auto-closed");
        await page.unroute("**/api/mock-shifts");

        await resetMock(request);
        await primary.click(); // a fresh mock: the name is remembered, so this checks in here...
        await expect(page.getByTestId("elapsed")).toBeVisible();
        await gotoKitchen(page, CODE_2); // ...and kitchen 2 says to check out here first
        await expect(page.getByTestId("elapsed")).toHaveCount(0);
        await expect(page.getByRole("link")).not.toHaveCount(0);
        await shot("8-elsewhere");

        await gotoKitchen(page, "NOT-A-REAL-CODE-000000");
        await expect(h1).toBeVisible();
        await shot("9-unknown");

        await page.route("**/api/mock-shifts", (route) => route.abort("internetdisconnected"));
        await gotoKitchen(page);
        await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
        await shot("10-no-signal");
      });
    }
  }
});
