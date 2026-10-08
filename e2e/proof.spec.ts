import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

// /proof: files and the CF 888 stay on the phone. Logs volunteer hours at a named place,
// then adds a file, fills the CF 888 for that place, and checks the downloaded PDF.

async function addHours(page: Page, { type, hours, place }: { type: RegExp; hours: string; place?: string }) {
  await page.getByRole("button", { name: "Add hours", exact: true }).click();
  await page.getByRole("radio", { name: type }).check();
  await page.getByLabel("How many hours?").fill(hours);
  if (place) await page.getByLabel("Where? (optional)").fill(place);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("proof: a box per logged activity, files stay listed, and the CF 888 is filled on the phone", async ({ page }) => {
  // Anything posted to the server during this test would mean personal data left the phone.
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
  });

  await page.goto("/log");
  await addHours(page, { type: /^Volunteering/, hours: "3", place: "Food Bank" });
  await addHours(page, { type: /^Volunteering/, hours: "2.5", place: "food bank" });
  await addHours(page, { type: /^Paid work/, hours: "8" });

  await page.getByRole("link", { name: "Your proof documents" }).click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your proof" })).toBeVisible();

  const work = page.getByTestId("proof-work");
  const volunteer = page.getByTestId("proof-volunteer");
  await expect(work).toContainText("8 hours logged");
  await expect(volunteer).toContainText("5.5 hours logged");
  await expect(page.getByTestId("proof-job_search")).toHaveCount(0);

  // A long file name must not push the page sideways at 360px.
  const longName = `pay-stub-${"october-".repeat(12)}2026.pdf`;
  await page.getByLabel("Add photos or PDFs for Paid work").setInputFiles({
    name: longName,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  });
  await expect(page.getByRole("status")).toContainText(`Added ${longName}.`);
  await expect(work.getByText(longName)).toBeVisible();
  await expectNoSidewaysScroll(page);

  // Not a photo or PDF: refused with a message, nothing listed.
  await page.getByLabel("Add photos or PDFs for Paid work").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: "clip.mp4" })).toContainText("clip.mp4 wasn't added. Only photos and PDF files");
  await expect(work.getByRole("listitem")).toHaveCount(1);

  // Still there after a reload (IndexedDB, not page state).
  await page.reload();
  await expect(page.getByTestId("proof-work").getByText(longName)).toBeVisible();

  // One CF 888 for "Food Bank" (both spellings merged), prefilled with 5.5 hours.
  await page.getByRole("button", { name: "Fill a CF 888 for Food Bank" }).click();
  await expect(page.getByLabel("Hours", { exact: true })).toHaveValue("5.5");
  await expect(page.getByLabel("Organization")).toHaveValue("Food Bank");
  await page.getByLabel("Your full name").fill("Ana Pérez");
  await page.getByLabel("Your birthdate").fill("1990-04-07");
  await page.getByLabel("Street address").fill("123 Main St");
  await page.getByLabel("City, state and ZIP").fill("San Jose, CA 95112");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download the filled CF 888" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^CF-888-Food-Bank-\d{4}-\d{2}\.pdf$/);
  const form = (await PDFDocument.load(readFileSync(await download.path()))).getForm();
  expect(form.getTextField("CF 888_Text Field 0").getText()).toBe("Ana Pérez");
  expect(form.getTextField("CF 888_Text Field 1").getText()).toBe("04/07/1990");
  expect(form.getTextField("CF 888_Text Field 12").getText()).toBe("5.5");
  await expect(page.getByText(/^Next: ask the organization's representative/)).toBeVisible();

  // Remove the file.
  await page.getByRole("button", { name: `Remove ${longName}` }).click();
  await expect(page.getByTestId("proof-work")).toContainText("No files added yet.");

  // Last month has no hours: an empty state that points back to the log.
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByTestId("empty")).toContainText("No hours logged in");
  await expectNoSidewaysScroll(page);

  expect(posts).toEqual([]);
});
