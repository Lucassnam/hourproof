import { expect, test, type Page } from "@playwright/test";

async function reachApplicableResult(page: Page) {
  for (let i = 0; i < 10; i++) {
    if (await page.getByRole("link", { name: "Start tracking my hours" }).isVisible().catch(() => false)) return;
    const none = page.getByRole("button", { name: "None of these apply" });
    if (await none.isVisible().catch(() => false)) await none.click();
    else await page.getByRole("button", { name: "No", exact: true }).click();
  }
}

test("recipient can reserve, check in, and add confirmed hours to the shared tracker", async ({ page }) => {
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

  await expect(page.getByText("4 hrs", { exact: true })).toBeVisible();
  await expect(page.getByText("verified volunteer hours")).toBeVisible();
  await expect(page.getByText(/Sample supervisor/)).toBeVisible();
  await expect(page.getByText(/also saved in Hours/)).toBeVisible();

  await toolNav.getByRole("link", { name: "Hours" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByText("Sample Community Kitchen")).toBeVisible();
  await expect(page.getByText("4 hours", { exact: true })).toBeVisible();
});

test("ShiftCred appears after the screener says the rule applies", async ({ page }) => {
  await page.goto("/screener");
  await reachApplicableResult(page);
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
