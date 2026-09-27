import { test, expect, type Page } from "@playwright/test";

// The whole loop (Phase 2, Task 8): the demo video's script, as a test.
//
// Case 2 must run in the SAME browser context (same page) as case 1, so the real 8-hour
// entry case 1 saves to the on-device store is still there after "Try the demo" and "Exit
// demo" — that's the isolation guarantee the store tests cover in unit form, and this is
// the end-to-end proof that the whole flow honors it. Both halves live in a single `test()`
// (not two `test()`s, even under `.serial`) so there is exactly one Page/IndexedDB for both.

const CHECKLIST_HEADING = "Do any of these apply to you?";

async function answerNoUntil(page: Page, heading: string, maxScreens = 10): Promise<number> {
  for (let i = 0; i < maxScreens; i++) {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    const text = (await h1.textContent()) ?? "";
    if (text === heading || new RegExp(heading).test(text)) return i;
    await page.getByRole("button", { name: "No", exact: true }).click();
  }
  throw new Error(`never reached a screen matching ${heading}`);
}

async function addHours(page: Page, { type, hours }: { type: RegExp; hours: string }) {
  await page.getByRole("button", { name: "Add hours", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add hours" })).toBeVisible();
  await page.getByRole("radio", { name: type }).check();
  await page.getByLabel("How many hours?").fill(hours);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();
}

function ring(page: Page) {
  return page.getByRole("img", { name: /of 80 hours/ });
}

test("the whole loop: check -> subject -> track 8 hours, then try the demo and exit back to the real 8 hours", async ({
  page,
}) => {
  // --- Case 1: Home -> Check -> subject path in <= 5 screens -> Start tracking -> add 8h ---
  await page.goto("/");
  await page.getByRole("link", { name: "Check if the rule applies to you" }).click();
  await expect(page).toHaveURL(/\/screener$/);

  let screens = await answerNoUntil(page, CHECKLIST_HEADING);
  await page.getByRole("button", { name: "None of these apply" }).click();
  screens += 1;
  screens += await answerNoUntil(page, "The rule likely applies to you");

  // The "subject" result: the screener's own e2e already asserts the exact copy; here we
  // only need the entry point into the log and the screen-count budget.
  expect(screens).toBeLessThanOrEqual(5);
  const track = page.getByRole("link", { name: "Start tracking my hours" });
  await expect(track).toBeVisible();
  await expect(track).toHaveAttribute("href", "/log");
  await track.click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your hours" })).toBeVisible();

  await addHours(page, { type: /^Paid work/, hours: "8" });
  await expect(ring(page)).toHaveAttribute("aria-label", "8 of 80 hours this month");

  // --- Case 2: Home -> Try the demo -> banner, seeded ring, behind status, pace with a
  // per-day number -> Exit demo -> /log shows the real 8-hour entry from case 1, not demo ---
  await page.goto("/");
  const tryDemo = page.getByRole("button", { name: "Try the demo" });
  await expect(tryDemo).toBeVisible();
  await tryDemo.click();
  await expect(page).toHaveURL(/\/log$/);

  await expect(page.getByRole("region", { name: "Demo — sample data, not yours." })).toBeVisible();
  const demoRing = ring(page);
  await expect(demoRing).toBeVisible();
  const demoLabel = (await demoRing.getAttribute("aria-label")) ?? "";
  // The seeded month is deliberately not empty and not the real 8-hour entry.
  expect(demoLabel).not.toBe("0 of 80 hours this month");
  expect(demoLabel).not.toBe("8 of 80 hours this month");
  await expect(page.getByTestId("pace")).toHaveText(
    /^To reach 80 this month: [\d.,]+ more hours?\s+in\s+\d+ days?\s+—\s+about [\d.,]+ a day\.$/,
  );

  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/log");
  await expect(page.getByRole("region", { name: "Demo — sample data, not yours." })).toHaveCount(0);
  await expect(ring(page)).toHaveAttribute("aria-label", "8 of 80 hours this month");
});
