import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

// "Keep your hours safe" on the hour log: a copy of the hours as a file, putting it back on
// another phone, and the Home Screen hint. Hours live only on the phone, so this is the
// person's only protection against a lost phone or cleared browser storage.

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function ring(page: Page) {
  return page.getByRole("img", { name: /of 80 hours/ });
}

async function addHours(page: Page, { type, hours }: { type: RegExp; hours: string }) {
  await page.getByRole("button", { name: "Add hours", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add hours" })).toBeVisible();
  await page.getByRole("radio", { name: type }).check();
  await page.getByLabel("How many hours?").fill(hours);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

async function openKeepSafe(page: Page) {
  await page.getByText("Keep your hours safe").click();
  await expect(page.getByRole("button", { name: "Save a copy of my hours" })).toBeVisible();
}

test("save a copy on one phone, restore it on another, and restoring twice adds nothing twice", async ({ page, browser }, testInfo) => {
  await page.goto("/log");
  await openKeepSafe(page);
  await page.getByRole("button", { name: "Save a copy of my hours" }).click();
  await expect(page.getByTestId("keep-safe-status")).toHaveText("There are no hours to save yet.");

  await addHours(page, { type: /^Paid work/, hours: "4" });
  await addHours(page, { type: /^Volunteering/, hours: "2.5" });
  await openKeepSafe(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save a copy of my hours" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^hourproof-hours-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByTestId("keep-safe-status")).toHaveText("Saved a copy with 2 entries.");

  const path = testInfo.outputPath("copy.json");
  await download.saveAs(path);
  const copy = JSON.parse(await readFile(path, "utf8")) as { format: string; version: number; entries: { type: string; hours: number }[] };
  expect(copy.format).toBe("hourproof-hours");
  expect(copy.version).toBe(1);
  expect(copy.entries.map((e) => [e.type, e.hours]).sort()).toEqual([["volunteer", 2.5], ["work", 4]]);

  // Another phone: nothing saved yet.
  const other = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 } })).newPage();
  await other.goto("/log");
  await expect(ring(other)).toHaveAttribute("aria-label", "0 of 80 hours this month");
  await openKeepSafe(other);
  await other.getByLabel("Choose a saved copy of your hours to restore").setInputFiles(path);
  await expect(other.getByTestId("keep-safe-status")).toHaveText("Added 2 entries from the copy.");
  await expect(ring(other)).toHaveAttribute("aria-label", "6.5 of 80 hours this month");

  await other.getByLabel("Choose a saved copy of your hours to restore").setInputFiles(path);
  await expect(other.getByTestId("keep-safe-status")).toHaveText("Added 0 entries from the copy. 2 were already here.");
  await expect(ring(other)).toHaveAttribute("aria-label", "6.5 of 80 hours this month");
});

test("a file that isn't a copy of HourProof hours is refused, and nothing changes", async ({ page }) => {
  await page.goto("/log");
  await openKeepSafe(page);
  await page.getByLabel("Choose a saved copy of your hours to restore").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ entries: [{ id: "x", type: "work", hours: 80 }] })),
  });
  await expect(page.getByTestId("keep-safe").getByRole("alert")).toHaveText("That file isn't a copy of HourProof hours.");
  await expect(ring(page)).toHaveAttribute("aria-label", "0 of 80 hours this month");
});

test("the demo has no copy or restore: it holds sample data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
  await expect(page.getByTestId("keep-safe")).toHaveCount(0);
});

test("an iPhone in the browser gets the Home Screen steps; a browser with no way to install gets none", async ({ browser }, testInfo) => {
  const base = { baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 } };
  const iphone = await (await browser.newContext({ ...base, userAgent: IPHONE })).newPage();
  await iphone.goto("/log");
  await openKeepSafe(iphone);
  await expect(iphone.getByTestId("install-ios")).toContainText("tap Share, then Add to Home Screen");
  await expect(iphone.getByTestId("install-ios")).toContainText("Save a copy here first, then restore it there.");

  const desktop = await (
    await browser.newContext({ ...base, userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" })
  ).newPage();
  await desktop.goto("/log");
  await openKeepSafe(desktop);
  await expect(desktop.getByTestId("install-ios")).toHaveCount(0);
});
