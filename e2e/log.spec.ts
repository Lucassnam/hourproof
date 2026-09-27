import { test, expect, type Page } from "@playwright/test";
import { addMonths, californiaDate, monthOf } from "../src/lib/dates";
import { formatDay } from "../src/app/log/format";

// Hour log (Phase 2, Task 7). Every Playwright context starts with an empty IndexedDB, so
// each test begins on an empty month. "Today" is the California date, like the app's.

function ring(page: Page) {
  return page.getByRole("img", { name: /(of|de) 80 (hours|horas)/ });
}

function addButton(page: Page, name = "Add hours") {
  return page.getByRole("button", { name, exact: true });
}

// Entry rows in the "Saved hours" list (not the bullet notes above it).
function rows(page: Page) {
  return page.getByRole("region", { name: "Saved hours" }).getByRole("listitem");
}

async function gotoLog(page: Page) {
  await page.goto("/log");
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
  // Enabled once the on-device store has opened (after hydration).
  await expect(addButton(page)).toBeEnabled();
}

async function addEntry(page: Page, { type, hours, inProgram }: { type: RegExp; hours: string; inProgram?: boolean }) {
  await addButton(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add hours" })).toBeVisible();
  await page.getByRole("radio", { name: type }).check();
  if (inProgram !== undefined) {
    const box = page.getByRole("checkbox", { name: "Part of a job program?" });
    await expect(box).toBeVisible();
    await box.setChecked(inProgram);
  }
  await page.getByLabel("How many hours?").fill(hours);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

function monthName(locale: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  const text = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

test("1. empty state, then 4 hours of volunteering today shows 4 of 80 and the entry", async ({ page }) => {
  await gotoLog(page);
  await expect(page.getByTestId("empty")).toContainText("No hours saved for this month yet.");
  await expect(page.getByTestId("empty")).toContainText("paid work, volunteering, and job training programs");
  await expect(ring(page)).toHaveAttribute("aria-label", "0 of 80 hours this month");
  await expect(page.getByTestId("pace")).toHaveText("No hours yet this month.");
  await expect(page.getByText("Your hours are saved only on this phone.")).toBeVisible();
  // "How the rule works" is collapsed; the 10-day report line lives only inside it.
  const tenDays = page.getByText(
    "If the work rule applies to you and your hours drop below 20 a week, tell your county within 10 days.",
  );
  await expect(tenDays).toBeHidden();
  await page.getByText("How the rule works", { exact: true }).click();
  await expect(tenDays).toBeVisible();
  await expect(page.getByText("Work, volunteering and job programs add up. You need 80 hours a month.")).toBeVisible();
  await page.getByText("How the rule works", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Check if the rule applies to you" })).toHaveAttribute("href", "/screener");

  await addButton(page).click();
  // The form defaults to today and doesn't allow later dates.
  const date = page.getByLabel("Date");
  await expect(date).toHaveValue(californiaDate());
  await expect(date).toHaveAttribute("max", californiaDate());
  // The chosen day, spelled out in the page's language, is linked to the date field.
  const dayLine = page.getByText(formatDay("en", californiaDate()), { exact: true });
  await expect(dayLine).toBeVisible();
  await expect(date).toHaveAttribute("aria-describedby", new RegExp(`(^| )${await dayLine.getAttribute("id")}( |$)`));
  // Save and Cancel sit in a sticky bar: reachable on a 360x740 screen without scrolling.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  await page.getByRole("radio", { name: /^Volunteering/ }).check();
  await page.getByRole("button", { name: "4 hours", exact: true }).click();
  await expect(page.getByLabel("How many hours?")).toHaveValue("4");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(ring(page)).toHaveAttribute("aria-label", "4 of 80 hours this month");
  await expect(page.getByTestId("empty")).toHaveCount(0);
  const row = rows(page).filter({ hasText: "Volunteering" });
  await expect(row).toContainText("4 hours");
  await expect(page.getByRole("status")).toContainText("Saved.");
});

test("2. edit to 6 hours, then delete with the confirm step", async ({ page }) => {
  await gotoLog(page);
  await addEntry(page, { type: /^Volunteering/, hours: "4" });
  await expect(ring(page)).toHaveAttribute("aria-label", "4 of 80 hours this month");

  await page.getByRole("button", { name: /^Edit: Volunteering, 4 hours/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit hours" })).toBeVisible();
  await expect(page).toHaveURL(/\/log\?edit=/);
  await expect(page.getByLabel("How many hours?")).toHaveValue("4");
  await page.getByLabel("How many hours?").fill("6");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ring(page)).toHaveAttribute("aria-label", "6 of 80 hours this month");
  await expect(rows(page).filter({ hasText: "Volunteering" })).toContainText("6 hours");

  await page.getByRole("button", { name: /^Edit: Volunteering, 6 hours/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Delete this entry? You can't undo this.")).toBeVisible();
  // The confirm is keyboard-reachable: focus lands on "Yes, delete" and Enter confirms.
  await expect(page.getByRole("button", { name: "Yes, delete" })).toBeFocused();
  // …and it isn't hidden under the sticky Save bar.
  const yes = await page.getByRole("button", { name: "Yes, delete" }).boundingBox();
  const bar = await page.getByRole("button", { name: "Save", exact: true }).locator("xpath=..").boundingBox();
  expect(yes && bar && yes.y + yes.height <= bar.y).toBe(true);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
  await expect(ring(page)).toHaveAttribute("aria-label", "0 of 80 hours this month");
  await expect(page.getByTestId("empty")).toBeVisible();
});

test("3. job search outside a program shows the note and doesn't change the count", async ({ page }) => {
  await gotoLog(page);
  await addEntry(page, { type: /^Job search/, hours: "3", inProgram: false });

  await expect(ring(page)).toHaveAttribute("aria-label", "0 of 80 hours this month");
  await expect(
    page.getByText(
      "Job search on your own doesn't count. It only counts as part of a job program, like CalFresh E&T, WIOA or Trade Act.",
    ),
  ).toBeVisible();
  const row = rows(page).filter({ hasText: "Job search" });
  await expect(row).toContainText("3 hours");
  await expect(row).toContainText("Doesn't count");
  // One paid hour puts the month behind (1 hour can never project to 80): the pace line says
  // so factually, but no "tell your county" alert appears among the notes.
  await addEntry(page, { type: /^Paid work/, hours: "1" });
  await expect(ring(page)).toHaveAttribute("aria-label", "1 of 80 hours this month");
  await expect(page.getByTestId("pace")).toHaveText(/^You need \d+ more hours/);
  await expect(page.getByRole("region", { name: "Good to know" })).not.toContainText("10 days");
  await expect(page.getByText(/within 10 days/)).toBeHidden();
});

test("3b. capped job search in a program: the row says it may count partly", async ({ page }) => {
  await gotoLog(page);
  await addEntry(page, { type: /^Job training or program/, hours: "4" });
  await addEntry(page, { type: /^Job search/, hours: "5", inProgram: true });
  // 4 program hours + job search counted only up to 3.75 (less than the program hours).
  await expect(ring(page)).toHaveAttribute("aria-label", "7.8 of 80 hours this month");
  const jobSearch = rows(page).filter({ hasText: "Job search" });
  await expect(jobSearch).toContainText("May count partly");
  await expect(jobSearch).not.toContainText("Doesn't count");
  await expect(rows(page).filter({ hasText: "Job training or program" })).not.toContainText("May count partly");
});

test("4. 25 hours shows an error on the hours field, focuses it, and saves nothing", async ({ page }) => {
  await gotoLog(page);
  await addButton(page).click();
  const hours = page.getByLabel("How many hours?");
  await hours.fill("25");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const message = page.getByText("Enter hours from 0.25 to 24, in quarter hours (like 1.5).");
  await expect(message).toBeVisible();
  await expect(hours).toBeFocused();
  await expect(hours).toHaveAttribute("aria-invalid", "true");
  // The message is linked to the field with aria-describedby.
  const describedBy = ((await hours.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
  const described = await Promise.all(describedBy.map((id) => page.locator(`[id="${id}"]`).innerText()));
  expect(described.join(" ")).toContain("Enter hours from 0.25 to 24");
  // Still on the form.
  await expect(page.getByRole("heading", { level: 1, name: "Add hours" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(ring(page)).toHaveAttribute("aria-label", "0 of 80 hours this month");
  await expect(page.getByTestId("empty")).toBeVisible();
});

test("5. offline: adding 2 hours after the page loaded still saves and updates the ring", async ({ page, context }) => {
  await gotoLog(page);
  await context.setOffline(true);
  try {
    await addEntry(page, { type: /^Paid work/, hours: "2" });
    await expect(ring(page)).toHaveAttribute("aria-label", "2 of 80 hours this month");
    await expect(rows(page).filter({ hasText: "Paid work" })).toContainText("2 hours");
  } finally {
    await context.setOffline(false);
  }
});

test("6. Spanish: ring label and pace line are in Spanish, with no English on the screen", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "es", domain: "localhost", path: "/" }]);
  await page.goto("/log");
  await expect(page.getByRole("heading", { level: 1, name: "Sus horas" })).toBeVisible();
  await expect(addButton(page, "Agregar horas")).toBeEnabled();
  await expect(ring(page)).toHaveAttribute("aria-label", "0 de 80 horas este mes");
  await expect(page.getByTestId("pace")).toHaveText("Todavía no tiene horas este mes.");

  await addButton(page, "Agregar horas").click();
  await expect(page.getByText(formatDay("es", californiaDate()), { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /^Trabajo pagado/ }).check();
  await page.getByLabel("¿Cuántas horas?").fill("4,5");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(ring(page)).toHaveAttribute("aria-label", "4,5 de 80 horas este mes");
  await expect(page.getByTestId("pace")).toHaveText(
    /^(Va bien\. A este ritmo llegará a [\d.,]+ horas\.|Necesita [\d.,]+ horas? más( en \d+ días?: unas [\d.,]+ horas? al día\.|\. Hoy es el último día del mes\.))$/,
  );
  const text = await page.innerText("body");
  expect(text).not.toMatch(/\b(hours|Add|Save|Edit|month|Your|Paid|Loading)\b/);
});

test("7. month navigation: the previous month is a past month, and next is disabled on this month", async ({ page }) => {
  const current = monthOf(californiaDate());
  const previous = addMonths(current, -1);
  await gotoLog(page);

  const next = page.getByRole("button", { name: "Next month" });
  await expect(next).toBeDisabled();
  await expect(page.getByText(monthName("en", current), { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText(monthName("en", previous), { exact: true })).toBeVisible();
  await expect(page.getByText("Past month", { exact: true })).toBeVisible();
  await expect(page.getByTestId("pace")).toHaveText("This month is over. No hours were saved for it.");
  await expect(ring(page)).toHaveAttribute("aria-label", `0 of 80 hours in ${monthName("en", previous)}`);
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page.getByText(monthName("en", current), { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
});

test("8. the phone's Back button closes the form without leaving the log", async ({ page }) => {
  await gotoLog(page);
  await addButton(page).click();
  await expect(page).toHaveURL(/\/log\?add=1$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
  // Focus goes to the list's heading, so a screen reader announces where you are.
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeFocused();
});
