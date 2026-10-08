import { test, expect, type Page } from "@playwright/test";

// Final-review M11: at 200% zoom a 360px phone is 180 CSS px wide. Nothing on the home page,
// the screener checklist or the hour log may scroll sideways there (WCAG 1.4.10 reflow).

test.use({ viewport: { width: 180, height: 370 } });

async function expectNoSideScroll(page: Page, what: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${what}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

test("M11: no horizontal scroll at 180px on /, the screener checklist and /log (en and es)", async ({ page }) => {
  for (const lang of ["en", "es"] as const) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: lang, domain: "localhost", path: "/" }]);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSideScroll(page, `${lang} /`);

    await page.goto("/screener");
    const checklist = lang === "en" ? "Do any of these apply to you?" : "¿Le aplica alguna de estas situaciones?";
    for (let i = 0; i < 10; i++) {
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      if ((await h1.textContent()) === checklist) break;
      await page.getByRole("button", { name: "No", exact: true }).click();
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(checklist);
    // Open every "More about this" so the longest text is on the page too.
    for (const summary of await page.locator("fieldset summary").all()) await summary.click();
    await expectNoSideScroll(page, `${lang} /screener checklist`);

    await page.goto("/log");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: lang === "en" ? "Add hours" : "Agregar horas", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: lang === "en" ? "About your hour log" : "Acerca de su registro de horas" }).click();
    await expectNoSideScroll(page, `${lang} /log`);
    await page.getByRole("button", { name: lang === "en" ? "About your hour log" : "Acerca de su registro de horas" }).click();
    await page.getByRole("button", { name: lang === "en" ? "Previous month" : "Mes anterior" }).click();
    await expectNoSideScroll(page, `${lang} /log past month`);
  }
});
