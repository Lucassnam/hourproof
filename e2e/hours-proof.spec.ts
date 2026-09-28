import { expect, test } from "@playwright/test";

test("paid work can show a weekly earnings pathway and combine with volunteering", async ({ page }) => {
  await page.goto("/hours");
  const month = new Date().toISOString().slice(0, 7);
  await page.getByLabel("Month").fill(month);

  await page.getByRole("button", { name: "+ Add hours" }).click();
  await page.getByLabel("Where did you do it?").fill("Sample employer");
  await page.getByLabel("Date").fill(`${month}-02`);
  await page.getByLabel("Hours", { exact: true }).fill("8");
  await page.getByLabel("Gross pay before taxes").fill("217.50");
  await page.getByRole("button", { name: "Add to total" }).click();

  await expect(page.getByText("8", { exact: true })).toBeVisible();
  await expect(page.getByText("Earnings can also count", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "How earnings can count" }).click();
  await expect(page.getByText("Earnings can also count", { exact: true })).toBeVisible();
  await page.getByText("View the 4 weeks", { exact: true }).click();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Add hours" }).click();
  await page.getByRole("button", { name: "♥ Volunteering" }).click();
  await page.getByLabel("Where did you do it?").fill("Sample pantry");
  await page.getByLabel("Date").fill(`${month}-10`);
  await page.getByLabel("Hours", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Add to total" }).click();

  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample employer")).toBeVisible();
  await expect(page.getByText("Sample pantry")).toBeVisible();
});

test("documents groups used activities and accepts original evidence", async ({ page }) => {
  await page.goto("/hours");
  const month = new Date().toISOString().slice(0, 7);
  await page.getByRole("button", { name: "+ Add hours" }).click();
  await page.getByLabel("Where did you do it?").fill("Sample employer");
  await page.getByLabel("Date").fill(`${month}-02`);
  await page.getByLabel("Hours", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Add to total" }).click();
  await page.getByRole("link", { name: "Documents", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Upload your proof" })).toBeVisible();
  const workCard = page.locator("article").filter({ hasText: "Paid work" });
  await expect(workCard.getByText("Needed", { exact: true })).toBeVisible();
  const longFileName = "sample-employer-pay-stub-with-a-very-long-document-name-that-must-stay-inside-the-card-2026-09.pdf";
  await workCard.locator('input[type="file"]').setInputFiles({ name: longFileName, mimeType: "application/pdf", buffer: Buffer.from("sample proof") });
  await expect(workCard.getByText(longFileName)).toBeVisible();
  await expect(workCard.getByText("Proof added", { exact: true })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await expect(page.getByRole("button", { name: "Download packet summary (PDF)" })).toHaveCount(0);
});

test("volunteer can prepare CF 888 and upload the signed form", async ({ page }) => {
  await page.goto("/hours");
  const month = new Date().toISOString().slice(0, 7);
  await page.getByRole("button", { name: "+ Add hours" }).click();
  await page.getByRole("button", { name: "♥ Volunteering" }).click();
  await page.getByLabel("Where did you do it?").fill("Sample pantry");
  await page.getByLabel("Date").fill(`${month}-10`);
  await page.getByLabel("Hours", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Add to total" }).click();
  await page.getByRole("link", { name: "Documents", exact: true }).click();

  const volunteerCard = page.locator("article").filter({ hasText: "Volunteering" });
  await expect(volunteerCard.getByText("Signed CF 888 or similar signed verification")).toBeVisible();
  await volunteerCard.getByRole("button", { name: "Prepare official CF 888" }).click();
  await volunteerCard.getByLabel("Full legal name").fill("Sample Participant");
  await volunteerCard.getByLabel("Birthdate").fill("1990-02-03");
  await volunteerCard.getByLabel("Street address").fill("123 Main Street");
  await volunteerCard.getByLabel("City, state, ZIP").fill("San Jose, CA 95113");
  await volunteerCard.getByLabel("Authorized representative’s name").fill("Sample Supervisor");
  await volunteerCard.getByLabel("Organization address").fill("456 Market Street, San Jose, CA 95113");
  await volunteerCard.getByLabel("Organization phone").fill("408-555-0100");

  const formDownload = page.waitForEvent("download");
  await volunteerCard.getByRole("button", { name: "Download CF 888 draft" }).click();
  const downloadedForm = await formDownload;
  expect(downloadedForm.suggestedFilename()).toBe(`CF-888-Sample-pantry-${month}.pdf`);
  await expect(volunteerCard.getByRole("status")).toContainText("get a signature");

  await volunteerCard.locator('input[type="file"]').setInputFiles({ name: "signed-CF-888.pdf", mimeType: "application/pdf", buffer: Buffer.from("signed form") });
  await expect(volunteerCard.getByText("signed-CF-888.pdf")).toBeVisible();
  await expect(volunteerCard.getByText("Proof added", { exact: true })).toBeVisible();
});

test("documents page starts with one clear next step", async ({ page }) => {
  await page.goto("/proof");

  await expect(page.getByRole("heading", { name: "Add your hours first" })).toBeVisible();
  const toolNav = page.getByRole("navigation", { name: "HourProof tools" });
  await expect(toolNav.getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Hours", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Add my hours →" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Paid work" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open BenefitsCal →" })).toHaveCount(0);
});

test("applicable screener result offers the unified tracker", async ({ page }) => {
  await page.goto("/screener");
  for (let i = 0; i < 25; i++) {
    if (await page.getByRole("link", { name: "Open My 80 Hours" }).isVisible().catch(() => false)) break;
    await page.getByRole("button", { name: "No", exact: true }).click();
  }
  await expect(page.getByRole("link", { name: "Open My 80 Hours" })).toBeVisible();
});
