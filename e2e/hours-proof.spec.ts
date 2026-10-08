import { expect, test, type Page } from "@playwright/test";

async function addHours(
  page: Page,
  { type, hours, place }: { type: "Paid work" | "Volunteering"; hours: string; place: string },
) {
  await page.goto("/log?add=1");
  await page.getByLabel("How many hours?").fill(hours);
  await page.getByRole("radio", { name: new RegExp(`^${type}`) }).check();
  await page.getByLabel("Where? (optional)").fill(place);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function reachApplicableResult(page: Page) {
  for (let i = 0; i < 10; i++) {
    if (await page.getByRole("link", { name: "Start tracking my hours" }).isVisible().catch(() => false)) return;
    const none = page.getByRole("button", { name: "None of these apply" });
    if (await none.isVisible().catch(() => false)) await none.click();
    else await page.getByRole("button", { name: "No", exact: true }).click();
  }
}

test("old hours links lead to the one hour tracker", async ({ page }) => {
  await page.goto("/hours");

  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { name: "Your hours" })).toBeVisible();
  const tools = page.getByRole("navigation", { name: "HourProof tools" });
  await expect(tools.getByRole("link")).toHaveCount(3);
  await expect(tools.getByRole("link", { name: "Hours" })).toHaveAttribute("aria-current", "page");
});

test("documents uses hours from the canonical tracker and keeps long filenames inside the card", async ({ page }) => {
  await addHours(page, { type: "Paid work", hours: "8", place: "Sample employer" });
  await page.getByRole("link", { name: "Documents", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Your proof" })).toBeVisible();
  const workCard = page.getByTestId("proof-work");
  const longFileName = "sample-employer-pay-stub-with-a-very-long-document-name-that-must-stay-inside-the-card-2026-10.pdf";
  await workCard.locator('input[type="file"]').setInputFiles({
    name: longFileName,
    mimeType: "application/pdf",
    buffer: Buffer.from("sample proof"),
  });
  await expect(workCard.getByText(longFileName)).toBeVisible();
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test("volunteer can prepare the official CF 888 in the single documents flow", async ({ page }) => {
  await addHours(page, { type: "Volunteering", hours: "4", place: "Sample pantry" });
  await page.getByRole("link", { name: "Documents", exact: true }).click();

  const volunteerCard = page.getByTestId("proof-volunteer");
  await volunteerCard.getByRole("button", { name: "Fill a CF 888 for Sample pantry" }).click();
  await volunteerCard.getByLabel("Your full name").fill("Sample Participant");
  await volunteerCard.getByLabel("Your birthdate").fill("1990-02-03");
  await volunteerCard.getByLabel("Street address").fill("123 Main Street");
  await volunteerCard.getByLabel("City, state and ZIP").fill("San Jose, CA 95113");

  const formDownload = page.waitForEvent("download");
  await volunteerCard.getByRole("button", { name: "Download the filled CF 888" }).click();
  const downloadedForm = await formDownload;
  expect(downloadedForm.suggestedFilename()).toMatch(/^CF-888-Sample-pantry-\d{4}-\d{2}\.pdf$/);
  await expect(volunteerCard.getByRole("status")).toContainText("ask the organization's representative");
});

test("documents page has one clear navigation path when there are no hours", async ({ page }) => {
  await page.goto("/proof");

  await expect(page.getByRole("heading", { name: "Your proof" })).toBeVisible();
  await expect(page.getByText(/Keep photos and PDF files/)).toBeHidden();
  await page.getByRole("button", { name: "About proof documents" }).click();
  await expect(page.getByText(/Keep photos and PDF files/)).toBeVisible();
  const toolNav = page.getByRole("navigation", { name: "HourProof tools" });
  await expect(toolNav.getByRole("link")).toHaveCount(3);
  await expect(toolNav.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Add hours to your log" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Back to your hour log" })).toHaveCount(0);
});

test("applicable screener result has one tracker link and one volunteer option", async ({ page }) => {
  await page.goto("/screener");
  await reachApplicableResult(page);
  await expect(page.getByRole("link", { name: "Start tracking my hours" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Find a volunteer shift" })).toHaveCount(1);
});
