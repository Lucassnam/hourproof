import { test, expect, type Page } from "@playwright/test";

async function goToScreener(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Check if the rule applies to you" }).click();
  await expect(page).toHaveURL(/\/screener$/);
}

async function answer(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function bodyText(page: Page): Promise<string> {
  return page.innerText("body");
}

test("English: answering no to everything until meeting_80_hours, then yes, shows the meeting-requirement result", async ({
  page,
}) => {
  await goToScreener(page);

  // 17 "no" answers walk through every rule before meeting_80_hours (the 18th and final rule).
  for (let i = 0; i < 17; i++) {
    await answer(page, "No");
  }
  await answer(page, "Yes");

  const text = await bodyText(page);
  expect(text).toContain("you're meeting it");
  expect(text).toContain("This is not a decision. Only your county can decide.");
});

test("Pregnant path shows possibly-exempt result and never shows 'likely exempt' text", async ({ page }) => {
  await goToScreener(page);

  await answer(page, "No"); // age_scope
  await answer(page, "No"); // waived_county_scope
  await answer(page, "No"); // child_under_14_calfresh_household
  await answer(page, "Yes"); // pregnant

  const text = await bodyText(page);
  expect(text).toContain("You may be exempt");
  expect(text.toLowerCase()).not.toContain("likely exempt");
});

test("Back after a result returns to the question that produced it, not the result", async ({ page }) => {
  await goToScreener(page);

  await answer(page, "No"); // age_scope
  await answer(page, "No"); // waived_county_scope
  await answer(page, "No"); // child_under_14_calfresh_household
  await answer(page, "Yes"); // pregnant -> result

  await expect(page.getByText("You may be exempt")).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();

  // Back from a result undoes the answer that produced it, returning to that same question.
  await expect(page.getByRole("heading", { name: /pregnant/i })).toBeVisible();

  await answer(page, "No"); // pregnant -> no

  // Should now be on the NEXT question, not back on the result screen.
  await expect(page.getByText("You may be exempt")).not.toBeVisible();
  await expect(page.getByRole("heading")).toBeVisible();
});

test("Reloading on question 3 resumes at question 3", async ({ page }) => {
  await goToScreener(page);

  await answer(page, "No"); // age_scope -> question 2
  await answer(page, "No"); // waived_county_scope -> question 3

  const beforeReload = await page.getByRole("heading").textContent();
  await expect(page.getByText("Question 3 of")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Question 3 of")).toBeVisible();
  const afterReload = await page.getByRole("heading").textContent();
  expect(afterReload).toBe(beforeReload);
});

test("Spanish: shows 'Sí' and the Spanish not-a-decision line on a result", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Español" }).click();

  await page.getByRole("link", { name: "Vea si la regla le aplica" }).click();
  await expect(page).toHaveURL(/\/screener$/);

  await expect(page.getByRole("button", { name: "Sí" })).toBeVisible();

  await answer(page, "No estoy seguro");

  const text = await bodyText(page);
  expect(text).toContain("Esto no es una decisión. Solo su condado puede decidir.");
});

test("Unsure on question 1 leads to the ask-county result with a tel: link", async ({ page }) => {
  await goToScreener(page);

  await answer(page, "Not sure");

  const text = await bodyText(page);
  expect(text).toContain("Your county can");
  expect(text).toContain("What proof helps");
  await expect(page.getByText("What proof helps")).toBeVisible();

  const telLink = page.locator('a[href^="tel:"]');
  await expect(telLink).toBeVisible();
  await expect(telLink).toHaveAttribute("href", "tel:+14087583800");
});

test("A blocked sessionStorage does not break the screener", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
  });

  await goToScreener(page);

  await expect(page.getByText("Question 1 of")).toBeVisible();
  await answer(page, "No");
  await expect(page.getByText("Question 2 of")).toBeVisible();

  expect(errors).toEqual([]);
});
