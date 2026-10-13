import { test, expect } from "@playwright/test";

// The About and Privacy pages, and the footer that links to them from every screen.

const FOOTER = { name: "About this site" };

test("every kind of screen links to About and Privacy", async ({ page }) => {
  for (const path of ["/", "/screener", "/log", "/proof", "/k/TESTCODE-0000000000000", "/kitchen/test-kitchen"]) {
    await page.goto(path);
    const footer = page.getByRole("navigation", FOOTER);
    await expect(footer.getByRole("link", { name: "About HourProof" }), path).toHaveAttribute("href", "/about");
    await expect(footer.getByRole("link", { name: "Privacy" }), path).toHaveAttribute("href", "/privacy");
  }
});

test("About says what HourProof is not, that the rules are unreviewed, and how to reach someone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", FOOTER).getByRole("link", { name: "About HourProof" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "About HourProof" })).toBeVisible();
  await expect(page.getByText("HourProof is not CalFresh, your county or the State of California")).toBeVisible();
  // The shipped rules file has reviewedAt: null, so the page must say so, never claim a review.
  await expect(page.getByTestId("rules-review")).toHaveText(
    "No caseworker or legal-aid worker has reviewed our reading of the rules yet. Until one does, HourProof never tells you that you are exempt. It says you may be, and to ask your county.",
  );
  await expect(page.getByRole("link", { name: "(408) 758-3800" })).toHaveAttribute("href", "tel:+14087583800");
  // Exactly one way to write to the team: the address if one is configured, else GitHub.
  await expect(page.getByTestId("contact-email").or(page.getByTestId("contact-github"))).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Privacy says what stays on the phone and what kitchen check-in sends, in Spanish too", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "What stays on your phone" })).toBeVisible();
  await expect(page.getByText("When you check in at a kitchen: the first name or nickname you type")).toBeVisible();
  await expect(page.getByText("There are no ads and no tracking.")).toBeVisible();
  await page.getByRole("link", { name: "How to contact us" }).click();
  await expect(page).toHaveURL(/\/about#contact$/);

  await page.goto("/privacy");
  await page.getByRole("button", { name: /Español|Spanish/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacidad" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Lo que se queda en su teléfono" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
