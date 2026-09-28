import { expect, test } from "@playwright/test";

test("recipient can reserve, check in, get confirmed, and see proof", async ({ page }) => {
  await page.goto("/shiftcred");

  const toolNav = page.getByRole("navigation", { name: "HourProof tools" });
  await expect(toolNav.getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Volunteer", exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Volunteer nearby/i })).toBeVisible();
  await expect(page.getByText(/sample data/i)).toBeVisible();

  await page.getByRole("button", { name: /View shift/i }).first().click();
  await page.getByRole("button", { name: "Reserve this shift" }).click();
  await expect(page.getByRole("heading", { name: /signed up/i })).toBeVisible();

  await page.getByRole("button", { name: "Try demo check-in" }).click();
  await page.getByRole("button", { name: /Simulate QR scan/i }).click();
  await expect(page.getByRole("heading", { name: "Checked in" })).toBeVisible();

  await page.getByRole("button", { name: /Simulate end of shift/i }).click();
  await page.getByRole("button", { name: "Confirm 4 hours" }).click();

  await expect(page.locator("strong").filter({ hasText: /^4$/ })).toBeVisible();
  await expect(page.getByText("verified volunteer hours")).toBeVisible();
  await expect(page.getByText(/Sample supervisor/)).toBeVisible();

  await page.getByRole("button", { name: "Prepare official CF 888" }).click();
  await page.getByLabel("Full legal name").fill("Demo Volunteer");
  await page.getByLabel("Birthdate").fill("1990-01-02");
  await page.getByLabel("Street address").fill("123 Sample Street");
  await page.getByLabel("City, state, ZIP").fill("Mountain View, CA 94041");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download filled CF 888/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("CF-888-volunteer-hours-filled.pdf");
});

test("ShiftCred appears after the screener says the rule applies", async ({ page }) => {
  await page.goto("/screener");
  for (let i = 0; i < 25; i++) {
    if (await page.getByRole("link", { name: "Open My 80 Hours" }).isVisible().catch(() => false)) break;
    await page.getByRole("button", { name: "No", exact: true }).click();
  }
  await expect(page.getByRole("link", { name: "Find a volunteer shift" })).toBeVisible();
});

test("kitchen can create a profile, publish a shift, and receive a QR", async ({ page }) => {
  await page.goto("/shiftcred");
  await expect(page.getByRole("group", { name: "Map of sample volunteer shifts" })).toBeVisible();
  await page.getByRole("button", { name: /Run a kitchen or pantry/ }).click();
  await page.getByLabel("Organization name").fill("Demo Kitchen");
  await page.getByLabel("Authorized representative").fill("Dana Supervisor");
  await page.getByLabel("Work email").fill("dana@example.org");
  await page.getByLabel("Phone number").fill("650-555-0100");
  await page.getByLabel("Street address, city, ZIP").fill("100 Main Street, Mountain View, CA 94041");
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Demo Kitchen" })).toBeVisible();
  await page.getByRole("button", { name: /Publish shift/i }).click();
  await expect(page.getByAltText("Generated check-in QR code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today’s roster" })).toBeVisible();
});
