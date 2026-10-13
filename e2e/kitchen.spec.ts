import { test, expect, type Browser, type Page, type TestInfo, type APIRequestContext } from "@playwright/test";
import QRCode from "qrcode";
import { joinNamespace, mockCall, namespaceFor, resetMockWorld, serverTimeIs } from "./mock-world";

// The supervisor's dashboard (/kitchen/<slug>) and the QR poster (/kitchen/<slug>/poster),
// Phase 3, Task 5, against the in-memory mock backend. Each test has its own mock namespace
// (./mock-world.ts): the supervisor's page, any volunteer phone it opens, and the test's
// own API calls all join it, so a lockout or a rotated code never leaks into another test.
// Every page is 360 px wide (playwright.config.ts).

const SLUG = "test-kitchen";
const PIN = "123456";
const CODE = "TESTCODE-0000000000000";
const KITCHEN = "Community Kitchen (test)";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const CA = "America/Los_Angeles";

type ApiShift = { id: string; status: string; checkIn: string; checkOut: string | null; confirmedBy: string | null; reason: string | null };

let ns = "default";

test.beforeEach(async ({ page, request }, testInfo) => {
  ns = namespaceFor(testInfo);
  await joinNamespace(page, ns);
  await resetMockWorld(request, ns);
});

function caParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CA,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const p = (type: string) => parts.find((x) => x.type === type)!.value;
  return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}

// A volunteer's shift straight through the mock: checked in at `inAt`, checked out at
// `outAt` (or left open). `volunteerId` stands in for the phone.
async function apiShift(
  request: APIRequestContext,
  volunteerId: string,
  name: string,
  inAt: Date,
  outAt: Date | null,
): Promise<ApiShift> {
  const s = await mockCall<ApiShift>(request, ns, "checkIn", { code: CODE, displayName: name }, { volunteerId, at: inAt });
  if (!outAt) return s;
  return mockCall<ApiShift>(request, ns, "checkOut", { code: CODE }, { volunteerId, at: outAt });
}

async function openDashboard(page: Page, { pin = PIN, name = "Sam" } = {}) {
  await page.goto(`/kitchen/${SLUG}`);
  await page.getByLabel("Kitchen PIN (6 digits)").fill(pin);
  await page.getByLabel("Your first name").fill(name);
  await page.getByRole("button", { name: "Show shifts" }).click();
}

async function unlock(page: Page, opts: { pin?: string; name?: string } = {}) {
  await openDashboard(page, opts);
  await expect(page.getByText(`Signed in as ${opts.name ?? "Sam"}`)).toBeVisible();
}

// The dashboard opens on today (California). A shift that started before midnight is
// under Yesterday.
async function showDayOf(page: Page, iso: string, labels = { yesterday: "Yesterday" }) {
  if (caParts(Date.parse(iso)).date !== caParts(Date.now()).date) {
    await page.getByRole("button", { name: labels.yesterday }).click();
  }
}

const region = (page: Page, name: RegExp) => page.getByRole("region", { name });

async function newPhone(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 360, height: 740 },
  });
  await joinNamespace(context, ns);
  return context.newPage();
}

test("1. a wrong PIN says so; the PIN never lands in the URL or storage; Lock forgets it", async ({ page }) => {
  expect(page.viewportSize()).toEqual({ width: 360, height: 740 });
  await page.goto(`/kitchen/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: "Confirm volunteer shifts" })).toBeVisible();
  const pin = page.getByLabel("Kitchen PIN (6 digits)");
  await expect(pin).toHaveAttribute("inputmode", "numeric");
  await expect(pin).toHaveAttribute("autocomplete", "one-time-code");

  // Too short is caught on the page; nothing is sent.
  await pin.fill("123");
  await page.getByLabel("Your first name").fill("Sam");
  await page.getByRole("button", { name: "Show shifts" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Enter the 6 digits of the PIN.");

  await pin.fill("000000");
  await page.getByRole("button", { name: "Show shifts" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That PIN didn't work.");

  await pin.fill(PIN);
  await page.getByRole("button", { name: "Show shifts" }).click();
  await expect(page.getByText("Signed in as Sam")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(region(page, /^Waiting for you/)).toContainText("Nothing to confirm.");
  await expect(region(page, /^Checked in now/)).toContainText("No one is checked in.");
  await expect(region(page, /^Done/)).toContainText("No decisions yet.");

  expect(page.url()).toMatch(new RegExp(`/kitchen/${SLUG}$`));
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(PIN);
  expect(stored).not.toContain("000000");
  expect(await page.evaluate(() => sessionStorage.getItem("hp.kitchen.supervisorName"))).toBe("Sam");

  // Lock drops the PIN; the name is remembered for this browser session.
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByLabel("Kitchen PIN (6 digits)")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Your first name")).toHaveValue("Sam");
  await expect(page.getByLabel("Kitchen PIN (6 digits)")).toHaveValue("");
});

test("2. after 5 wrong PINs even the right one is refused as locked, until 15 minutes pass", async ({ page }) => {
  await page.goto(`/kitchen/${SLUG}`);
  await page.getByLabel("Your first name").fill("Sam");
  const pin = page.getByLabel("Kitchen PIN (6 digits)");
  const go = page.getByRole("button", { name: "Show shifts" });
  for (const wrong of ["000001", "000002", "000003", "000004", "000005"]) {
    await pin.fill(wrong);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await go.click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("That PIN didn't work.");
  }
  await pin.fill(PIN);
  await go.click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Too many tries. Wait 15 minutes.");

  // The lockout is per kitchen and ends 15 minutes after the last wrong try.
  await serverTimeIs(page, new Date(Date.now() + 16 * MIN));
  await pin.fill(PIN);
  await go.click();
  await expect(page.getByText("Signed in as Sam")).toBeVisible();
});

test("3. two phones: a check-in shows under Checked in now, a check-out under Waiting, and Confirm moves it to Done", async ({
  page,
  browser,
}, testInfo) => {
  await page.clock.install();
  await unlock(page);

  // The volunteer's phone: checked in 3 h 12 min ago (server time travel), at this kitchen.
  const phone = await newPhone(browser, testInfo);
  const started = new Date(Date.now() - (3 * HOUR + 12 * MIN));
  await serverTimeIs(phone, started);
  await phone.goto(`/k/${CODE}`);
  await phone.getByLabel("Your first name or nickname").fill("Maria");
  await phone.getByRole("button", { name: `Check in at ${KITCHEN}` }).click();
  await expect(phone.getByRole("heading", { level: 1, name: "You're checked in" })).toBeVisible();
  await phone.unroute("**/api/mock-shifts");

  await showDayOf(page, started.toISOString());
  // The dashboard refreshes itself every 30 seconds.
  await page.clock.fastForward(30_000);
  const now = region(page, /^Checked in now/);
  await expect(now.getByTestId("now-row")).toHaveCount(1);
  await expect(now.getByTestId("now-row")).toContainText("Maria");
  await expect(now.getByTestId("now-row")).toContainText(/Since \d{1,2}:\d{2}\sPM|Since \d{1,2}:\d{2}\sAM/);
  await expect(now.getByTestId("now-row")).toContainText(/3 h 1[23] min/);

  await phone.getByRole("button", { name: "Check out" }).click();
  await expect(phone.getByRole("heading", { level: 1, name: "You're checked out" })).toBeVisible();

  await page.clock.fastForward(30_000);
  const waiting = region(page, /^Waiting for you/);
  await expect(waiting.getByTestId("waiting-row")).toHaveCount(1);
  await expect(waiting.getByTestId("waiting-row")).toContainText("Maria");
  // 3 h 12 min rounds down to 3 hours.
  await expect(waiting.getByTestId("waiting-row")).toContainText("3 hours");
  await expect(now.getByTestId("now-row")).toHaveCount(0);
  await expect(waiting.getByTestId("badge")).toHaveCount(0);

  await page.getByRole("button", { name: "Confirm Maria" }).click();
  const done = region(page, /^Done/);
  await expect(done.getByTestId("done-row")).toContainText("Maria");
  await expect(done.getByTestId("done-row")).toContainText("✓ Confirmed by Sam");
  await expect(waiting.getByTestId("waiting-row")).toHaveCount(0);

  // The server agrees: the volunteer's shift is confirmed, by Sam.
  const volunteerId = await phone.evaluate(() => localStorage.getItem("hp.shifts.mockVolunteerId"));
  const shifts = await mockCall<ApiShift[]>(page.request, ns, "myShifts", { sinceDate: "2000-01-01" }, { volunteerId: volunteerId! });
  expect(shifts).toHaveLength(1);
  expect(shifts[0]).toMatchObject({ status: "confirmed", confirmedBy: "Sam" });
  await phone.context().close();
});

test("4. a decision that doesn't save is put back, with a plain message, and can be retried", async ({ page, request }) => {
  const s = await apiShift(request, "vol-a", "Maria", new Date(Date.now() - 2 * HOUR), new Date());
  await unlock(page);
  await showDayOf(page, s.checkIn);
  const waiting = region(page, /^Waiting for you/);
  await expect(waiting.getByTestId("waiting-row")).toContainText("Maria");

  await page.route("**/api/mock-shifts", (route) =>
    (route.request().postDataJSON() as { op: string }).op === "decide" ? route.abort("internetdisconnected") : route.continue(),
  );
  await page.getByRole("button", { name: "Confirm Maria" }).click();
  await expect(waiting.getByRole("alert")).toHaveText("No signal. Nothing was saved. Try again.");
  await expect(waiting.getByTestId("waiting-row")).toContainText("Maria");
  await expect(region(page, /^Done/)).toContainText("No decisions yet.");

  await page.unroute("**/api/mock-shifts");
  await page.getByRole("button", { name: "Confirm Maria" }).click();
  await expect(region(page, /^Done/).getByTestId("done-row")).toContainText("✓ Confirmed by Sam");
  await expect(waiting.getByRole("alert")).toHaveCount(0);
});

test("5. Reject needs a reason: a chip, or Other with words", async ({ page, request }) => {
  const s = await apiShift(request, "vol-b", "Ana", new Date(Date.now() - 3 * HOUR), new Date(Date.now() - HOUR));
  await unlock(page);
  await showDayOf(page, s.checkIn);
  const row = region(page, /^Waiting for you/).getByTestId("waiting-row");

  await page.getByRole("button", { name: "Reject Ana" }).click();
  await expect(row.getByRole("group", { name: "Why are you rejecting it?" })).toBeVisible();
  const submit = row.getByRole("button", { name: "Reject shift" });
  await expect(submit).toBeDisabled();

  await row.locator("label", { hasText: "Other" }).click();
  await expect(row.getByRole("radio", { name: "Other" })).toBeChecked();
  await expect(submit).toBeDisabled();
  await row.getByLabel("Reason").fill("   ");
  await expect(submit).toBeDisabled();
  await row.getByLabel("Reason").fill("Left after an hour");
  await expect(submit).toBeEnabled();

  // Cancel goes back to the two buttons; nothing was sent.
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Confirm Ana" })).toBeVisible();

  await page.getByRole("button", { name: "Reject Ana" }).click();
  await row.locator("label", { hasText: "Didn't work this shift" }).click();
  await submit.click();
  const done = region(page, /^Done/).getByTestId("done-row");
  await expect(done).toContainText("Rejected by Sam: Didn't work this shift");

  const [saved] = await mockCall<ApiShift[]>(request, ns, "myShifts", { sinceDate: "2000-01-01" }, { volunteerId: "vol-b" });
  expect(saved).toMatchObject({ status: "rejected", confirmedBy: "Sam", reason: "Didn't work this shift" });
});

test("6. a shift closed automatically at 8 hours needs the time they left before Confirm", async ({ page, request }) => {
  // Checked in 9 hours ago and never checked out: the backend closes it at 8 hours.
  const s = await apiShift(request, "vol-c", "Jose", new Date(Date.now() - 9 * HOUR), null);
  await unlock(page);
  await showDayOf(page, s.checkIn);
  const row = region(page, /^Waiting for you/).getByTestId("waiting-row");
  await expect(row).toContainText("Jose");
  await expect(row.getByTestId("badge")).toHaveText("Closed automatically");
  await expect(row).toContainText("8 hours");
  const endTime = row.getByLabel("Time they left");
  await expect(endTime).toHaveAttribute("type", "time");
  await expect(endTime).toHaveValue("");

  const confirm = page.getByRole("button", { name: "Confirm Jose" });
  await confirm.click();
  await expect(row.getByRole("alert")).toHaveText("Enter the time they left.");

  // More than 10 hours after check-in is refused on the page.
  const inMs = Date.parse(s.checkIn);
  await endTime.fill(caParts(inMs + 10 * HOUR + 30 * MIN).time);
  await expect(row.getByRole("alert")).toHaveCount(0);
  await confirm.click();
  await expect(row.getByRole("alert")).toContainText("at most 10 hours later");

  // They really left 5 hours after checking in (California time, to the minute).
  const leftAt = inMs + 5 * HOUR;
  await endTime.fill(caParts(leftAt).time);
  await confirm.click();
  const done = region(page, /^Done/).getByTestId("done-row");
  await expect(done).toContainText("✓ Confirmed by Sam");
  const [saved] = await mockCall<ApiShift[]>(request, ns, "myShifts", { sinceDate: "2000-01-01" }, { volunteerId: "vol-c" });
  expect(saved.status).toBe("confirmed");
  // The corrected end is the typed minute, in California time.
  expect(caParts(Date.parse(saved.checkOut!)).time).toBe(caParts(leftAt).time);
  const hours = Math.floor((Date.parse(saved.checkOut!) - inMs) / (15 * MIN)) / 4;
  expect(hours).toBeLessThanOrEqual(5);
  await expect(done).toContainText(`${hours} hours`);
});

test("7. the poster: a server-drawn QR of /k/<code>; rotating makes a new code and the old poster stops working", async ({
  page,
}) => {
  await page.goto(`/kitchen/${SLUG}/poster`);
  await expect(page.getByRole("heading", { level: 1, name: "Print the check-in poster" })).toBeVisible();
  await page.getByLabel("Kitchen PIN (6 digits)").fill("999999");
  await page.getByRole("button", { name: "Show poster" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That PIN didn't work.");
  expect(page.url()).toMatch(/\/poster$/);

  await page.getByLabel("Kitchen PIN (6 digits)").fill(PIN);
  await page.getByRole("button", { name: "Show poster" }).click();
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  const url = page.getByTestId("poster-url");
  const oldUrl = `http://localhost:7051/k/${CODE}`;
  await expect(url).toHaveText(oldUrl);
  const qr = page.getByTestId("qr");
  await expect(qr.locator("svg")).toHaveCount(1);
  await expect(qr).toHaveAttribute("aria-label", `QR code for ${oldUrl}`);
  // The QR encodes exactly the URL printed under it.
  const expected = await QRCode.toString(oldUrl, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  const drawn = await qr.locator("svg path[stroke]").getAttribute("d");
  expect(drawn).toBe(/<path stroke="#000000" d="([^"]+)"/.exec(expected)![1]);
  // Instructions in both languages, whatever the screen's language.
  await expect(page.getByTestId("poster")).toContainText("1. Open your phone camera.");
  await expect(page.getByTestId("poster")).toContainText("3. Toque Registrar entrada.");
  // The qrcode library is drawn on the server: no page script mentions it.
  const scripts = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".js")));
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text();
    expect(body, src).not.toContain("errorCorrectionLevel");
  }

  // Rotate: a confirm step first.
  await page.getByRole("button", { name: "Make a new code" }).click();
  await expect(page.getByTestId("rotate-warning")).toHaveText(
    "Old posters will stop working. Print the new poster and take the old one down.",
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(url).toHaveText(oldUrl);
  await page.getByRole("button", { name: "Make a new code" }).click();
  await page.getByRole("button", { name: "Yes, make a new code" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("New code made. Print this poster now; the old one no longer works.");
  await expect(url).not.toHaveText(oldUrl);
  const newUrl = await url.innerText();
  expect(newUrl).toMatch(/^http:\/\/localhost:7051\/k\/[A-Za-z0-9_-]{22}$/);
  await expect(qr).toHaveAttribute("aria-label", `QR code for ${newUrl}`);

  // The old poster's code is now unknown; the new one works.
  await page.goto(`/k/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: "This QR code isn't active" })).toBeVisible();
  await page.goto(new URL(newUrl).pathname);
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
});

test("7b. the poster prints on its own: controls hidden, the kitchen name, a QR at least 12 cm, both languages", async ({ page }) => {
  await page.goto(`/kitchen/${SLUG}/poster`);
  await page.getByLabel("Kitchen PIN (6 digits)").fill(PIN);
  await page.getByRole("button", { name: "Show poster" }).click();
  await expect(page.getByTestId("qr").locator("svg")).toHaveCount(1);

  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Make a new code" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Back to shifts" })).toBeHidden();
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: KITCHEN })).toBeVisible();
  const box = await page.getByTestId("qr").boundingBox();
  const cm = 96 / 2.54;
  expect(box!.width).toBeGreaterThanOrEqual(12 * cm);
  expect(box!.height).toBeGreaterThanOrEqual(12 * cm);
  await expect(page.getByTestId("poster")).toContainText("2. Point it at this code.");
  await expect(page.getByTestId("poster")).toContainText("2. Apunte a este código.");
});

test("8. Spanish: the dashboard and its decisions are in Spanish", async ({ page, context, request }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "es", domain: "localhost", path: "/" }]);
  const s = await apiShift(request, "vol-d", "Lupe", new Date(Date.now() - 2 * HOUR - 20 * MIN), new Date());
  await page.goto(`/kitchen/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: "Confirmar turnos de voluntarios" })).toBeVisible();
  await page.getByLabel("PIN de la cocina (6 dígitos)").fill("111111");
  await page.getByLabel("Su nombre").fill("Ana");
  await page.getByRole("button", { name: "Ver turnos" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Ese PIN no funcionó.");
  await page.getByLabel("PIN de la cocina (6 dígitos)").fill(PIN);
  await page.getByRole("button", { name: "Ver turnos" }).click();
  await expect(page.getByText("Conectado como Ana")).toBeVisible();
  await showDayOf(page, s.checkIn, { yesterday: "Ayer" });

  const row = region(page, /^Esperan su confirmación/).getByTestId("waiting-row");
  // 2 h 20 min rounds down to 2,25 hours, with 24-hour California times.
  await expect(row).toContainText(/\d{1,2}:\d{2}–\d{1,2}:\d{2} · 2,25 horas/);
  await expect(region(page, /^Presentes ahora/)).toContainText("No hay nadie registrado.");
  await page.getByRole("button", { name: "Rechazar a Lupe" }).click();
  await expect(row.getByRole("group", { name: "¿Por qué lo rechaza?" })).toBeVisible();
  await row.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Confirmar a Lupe" }).click();
  await expect(region(page, /^Listos/).getByTestId("done-row")).toContainText("✓ Confirmado por Ana");

  const text = await page.getByRole("main").innerText();
  expect(text).not.toMatch(/\b(Confirm|Reject|Waiting|Done|Signed|hours|Today|Yesterday)\b/);
});

// Screenshots of every state at 360 px (the poster's print view at A4 width), light/dark,
// en/es, into docs/screenshots/phase3/. Run with HP_SCREENSHOTS=1 (off by default so a
// normal e2e run doesn't rewrite them).
test.describe("screenshots", () => {
  test.use({ deviceScaleFactor: 2 });
  const copy = {
    en: { pin: "Kitchen PIN (6 digits)", name: "Your first name", go: "Show shifts", reject: "Reject Jose", confirm: "Confirm Lupe", chip: "Didn't work this shift", show: "Show poster", rotate: "Make a new code" },
    es: { pin: "PIN de la cocina (6 dígitos)", name: "Su nombre", go: "Ver turnos", reject: "Rechazar a Jose", confirm: "Confirmar a Lupe", chip: "No trabajó este turno", show: "Ver cartel", rotate: "Crear un código nuevo" },
  } as const;
  for (const lang of ["en", "es"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`screenshots: dashboard and poster, ${lang}, ${theme}`, async ({ page, context, request }) => {
        test.skip(!process.env.HP_SCREENSHOTS, "set HP_SCREENSHOTS=1 to write screenshots");
        test.setTimeout(120_000);
        const c = copy[lang];
        await context.addCookies([{ name: "NEXT_LOCALE", value: lang, domain: "localhost", path: "/" }]);
        if (theme === "dark") await page.addInitScript(() => localStorage.setItem("theme", "dark"));
        const shot = (state: string) =>
          page.screenshot({ path: `docs/screenshots/phase3/kitchen-${state}-${lang}-${theme}.png`, fullPage: true, animations: "disabled" });

        // A busy service: one checked in, two waiting (one closed automatically), two decided.
        const t = Date.now();
        await apiShift(request, "v1", "Maria", new Date(t - 95 * MIN), null);
        await apiShift(request, "v2", "Jose", new Date(t - 6 * HOUR), new Date(t - 2 * HOUR - 45 * MIN));
        const lupe = await apiShift(request, "v3", "Lupe", new Date(t - 9 * HOUR - 30 * MIN), null);
        const ana = await apiShift(request, "v4", "Ana", new Date(t - 7 * HOUR), new Date(t - 4 * HOUR));
        const kim = await apiShift(request, "v5", "Kim", new Date(t - 8 * HOUR), new Date(t - 7 * HOUR - 30 * MIN));
        await mockCall(request, ns, "decide", { slug: SLUG, pin: PIN, shiftId: ana.id, decision: "confirm", supervisor: "Sam" });
        await mockCall(request, ns, "decide", { slug: SLUG, pin: PIN, shiftId: kim.id, decision: "reject", supervisor: "Sam", reason: c.chip });

        await page.goto(`/kitchen/${SLUG}`);
        await expect(page.getByLabel(c.pin)).toBeVisible();
        await shot("1-unlock");
        await page.getByLabel(c.pin).fill("000000");
        await page.getByLabel(c.name).fill("Sam");
        await page.getByRole("button", { name: c.go }).click();
        await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
        await shot("2-wrong-pin");
        await page.getByLabel(c.pin).fill(PIN);
        await page.getByRole("button", { name: c.go }).click();
        await expect(page.getByTestId("waiting-row").first()).toBeVisible();
        await showDayOf(page, lupe.checkIn, { yesterday: lang === "en" ? "Yesterday" : "Ayer" });
        await expect(page.getByTestId("done-row")).toHaveCount(2);
        await shot("3-dashboard");

        await page.getByRole("button", { name: c.confirm }).click();
        await expect(page.getByTestId("waiting-row").filter({ hasText: "Lupe" }).getByRole("alert")).toBeVisible();
        await page.getByRole("button", { name: c.reject }).click();
        await page.getByTestId("waiting-row").filter({ hasText: "Jose" }).locator("label", { hasText: c.chip }).click();
        await shot("4-reject-and-end-time");

        await page.goto(`/kitchen/${SLUG}/poster`);
        await expect(page.getByLabel(c.pin)).toBeVisible();
        await shot("5-poster-pin");
        await page.getByLabel(c.pin).fill(PIN);
        await page.getByRole("button", { name: c.show }).click();
        await expect(page.getByTestId("qr").locator("svg")).toHaveCount(1);
        await shot("6-poster");
        await page.getByRole("button", { name: c.rotate }).click();
        await expect(page.getByTestId("rotate-warning")).toBeVisible();
        await shot("7-poster-rotate-confirm");

        await page.setViewportSize({ width: 794, height: 1123 });
        await page.emulateMedia({ media: "print" });
        await shot("8-poster-print");
      });
    }
  }
});
