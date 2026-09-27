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

// Answers "No" until the question heading matches `heading`. Counting fixed numbers of "No"
// would break on Nov 1, 2026, when the waived-county question (validUntil 2026-10-31) drops out.
async function answerNoUntil(page: Page, heading: RegExp) {
  for (let i = 0; i < 25; i++) {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    if (heading.test((await h1.textContent()) ?? "")) return;
    await answer(page, "No");
  }
  throw new Error(`never reached a question matching ${heading}`);
}

const MEETING_EN = /Right now, do you work, volunteer or go to an approved program/;

test("English: answering no to everything until meeting_80_hours, then yes, shows the meeting-requirement result", async ({
  page,
}) => {
  await goToScreener(page);

  // "No" to every rule before meeting_80_hours (the final rule), then "Yes".
  await answerNoUntil(page, MEETING_EN);
  await answer(page, "Yes");

  const text = await bodyText(page);
  expect(text).toContain("you're meeting it");
  expect(text).toContain("This is not a decision. Only your county can decide.");
});

test("Pregnant path shows possibly-exempt result and never shows 'likely exempt' text", async ({ page }) => {
  await goToScreener(page);

  await answerNoUntil(page, /pregnant/i); // age_scope, waived_county_scope (until Oct 31), child_under_14
  await answer(page, "Yes"); // pregnant

  const text = await bodyText(page);
  expect(text).toContain("You may be exempt");
  expect(text.toLowerCase()).not.toContain("likely exempt");
});

// Task 3 (screener engine v2) replaced the per-rule exemption walkthrough with a single
// checklist Step. Going back into a real checklist re-shows the same checked boxes; it does
// not reopen "the pregnant question" specifically, since the Phase 1 temporary UI adapter
// (Screener.tsx) has already folded every exemption id into the checklist's finalized
// answers by the time a result exists. Restored in Task 4, when the checklist gets its real
// checkbox UI and a matching back behavior.
test.fixme("Back after a result returns to the question that produced it, not the result", async ({ page }) => {
  await goToScreener(page);

  await answerNoUntil(page, /pregnant/i); // age_scope, waived_county_scope (until Oct 31), child_under_14
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

// ---------------------------------------------------------------------------
// Final-review fix wave (2026-09-25)
// ---------------------------------------------------------------------------

async function chooseSpanishAndStart(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Español" }).click();
  await page.getByRole("link", { name: "Vea si la regla le aplica" }).click();
  await expect(page).toHaveURL(/\/screener$/);
}

const GENERAL_SOURCE = "https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2026/26-29.pdf";

test("C1: Spanish question 1 is in Spanish, with no '(solo en inglés)' tag", async ({ page }) => {
  await chooseSpanishAndStart(page);

  await expect(page.getByText("Pregunta 1 de")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Tiene usted menos de 18 años, o 65 años o más?");
  await expect(page.getByText("siga respondiendo las preguntas")).toBeVisible(); // Spanish hint
  const text = await bodyText(page);
  expect(text).not.toContain("(solo en inglés)");
  expect(text).not.toContain("Are you under 18");
});

test("C1: every Spanish question and the final result have no English rule text", async ({ page }) => {
  await chooseSpanishAndStart(page);

  for (let i = 0; i < 25; i++) {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    const text = await bodyText(page);
    expect(text).not.toContain("(solo en inglés)");
    if (!text.includes("Pregunta ")) break; // reached the result
    expect((await h1.textContent()) ?? "").toMatch(/^(¿|En este momento)/);
    await answer(page, "No");
  }
  const result = await bodyText(page);
  expect(result).toContain("Esto no es una decisión. Solo su condado puede decidir.");
  expect(result).toContain("En su próxima renovación de CalFresh");
});

test("M1: Spanish possibly-exempt result is conditional and never says 'Es probable que usted esté exento'", async ({ page }) => {
  await chooseSpanishAndStart(page);

  await answerNoUntil(page, /embarazada/);
  await answer(page, "Sí");

  const text = await bodyText(page);
  expect(text).toContain("Es posible");
  expect(text).not.toContain("Es probable que usted esté exento");
  expect(text).toContain("Esto no es una decisión. Solo su condado puede decidir.");
  expect(text).toContain("Por lo general, basta con decírselo al condado."); // Spanish proof
  expect(text).not.toContain("(solo en inglés)");
});

test("I1: question-time guidance shows as a hint on the question, not on the result", async ({ page }) => {
  await goToScreener(page);

  await expect(page.getByText("Ages 60 to 64 are NOT exempt because of age alone")).toBeVisible();
  await answer(page, "Yes"); // age_scope -> not_subject

  const text = await bodyText(page);
  expect(text).toContain("The county already has your birth date.");
  expect(text).not.toContain("keep answering the questions");
});

// Task 3 (screener engine v2) turned veteran_info into a checklist "note" (continue-outcome
// info folded into the checklist screen for passive display), so it's no longer asked as its
// own yes/no/unsure question. Restored in Task 4, once the real checklist UI has a place to
// show notes.
test.fixme("I1: the veteran hint shows on its question; unsure there shows no empty 'What proof helps'", async ({ page }) => {
  await goToScreener(page);

  await answerNoUntil(page, /Are you a veteran\?/);
  await expect(page.getByText("go back and answer yes to the disability benefits question")).toBeVisible();
  await answer(page, "Not sure");

  const text = await bodyText(page);
  expect(text).toContain("You weren't sure about: Are you a veteran?");
  expect(text).not.toContain("What proof helps");
  expect(text).toContain("This is not a decision. Only your county can decide.");
});

test("M9: 'What proof helps' is an h2", async ({ page }) => {
  await goToScreener(page);
  await answer(page, "Not sure");
  await expect(page.getByRole("heading", { level: 2, name: "What proof helps" })).toBeVisible();
});

test("M2 + M3 + I5: the subject result uses the general CDSS source, hedged copy and a 48px Source link", async ({ page }) => {
  await goToScreener(page);

  await answerNoUntil(page, MEETING_EN);
  await answer(page, "No"); // -> subject

  const text = await bodyText(page);
  expect(text).toContain("At your next CalFresh renewal, you may need 80 hours a month");
  expect(text).toContain("Ask your county when it starts for you.");

  const source = page.getByRole("link", { name: "Source" });
  await expect(source).toHaveAttribute("href", GENERAL_SOURCE);
  const box = await source.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
});

test("M5 + M10: buttons have a visible border and the phone number never wraps", async ({ page }) => {
  await goToScreener(page);

  const yes = page.getByRole("button", { name: "Yes", exact: true });
  expect(parseFloat(await yes.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);

  await answer(page, "Not sure");
  const call = page.locator('a[href^="tel:"]');
  expect(parseFloat(await call.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);
  const num = call.getByText("(408) 758-3800", { exact: true });
  await expect(num).toHaveCSS("white-space", "nowrap");
});

test("I6: Back on question 1 goes home", async ({ page }) => {
  await goToScreener(page);
  await expect(page.getByText("Question 1 of")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Check if the rule applies to you" })).toBeVisible();
});

test("I6: switching language mid-screener keeps the question number and shows Spanish", async ({ page }) => {
  await goToScreener(page);
  await answer(page, "No");
  await answer(page, "No");
  await expect(page.getByText("Question 3 of")).toBeVisible();
  const english = await page.getByRole("heading", { level: 1 }).textContent();

  const es = page.getByRole("button", { name: "Switch to Spanish" });
  const box = await es.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  await es.click();

  await expect(page.getByText("Pregunta 3 de")).toBeVisible();
  const spanish = page.getByRole("heading", { level: 1 });
  await expect(spanish).not.toHaveText(english ?? "");
  await expect(spanish).toHaveText(/^¿/);
  expect(await bodyText(page)).not.toContain("(solo en inglés)");
  await expect(page.getByRole("button", { name: "Cambiar a español" })).toHaveAttribute("aria-current", "true");

  // And back to English, still on question 3.
  await page.getByRole("button", { name: "Cambiar a inglés" }).click();
  await expect(page.getByText("Question 3 of")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(english ?? "");
});

test("M14: the apple-touch-icon is linked and served", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(href).toBe("/apple-touch-icon.png");
  const res = await request.get("/apple-touch-icon.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("I3: /screener shows question 1 and the bilingual call-your-county notice", async ({ page }) => {
    await page.goto("/screener");
    const text = await bodyText(page);
    expect(text).toContain("Question 1 of");
    expect(text).toContain("Are you under 18, or 65 or older?");
    expect(text).toContain("This screener needs JavaScript. Call your county:");
    expect(text).toContain("Este cuestionario necesita JavaScript. Llame a su condado:");
    expect(text).toContain("Santa Clara County");
    expect(text).toContain("(408) 758-3800");
    await expect(page.locator('noscript a[href="tel:+14087583800"], a[href="tel:+14087583800"]').first()).toBeVisible();
  });

  test("I3: the home page shows the notice and its language choice works", async ({ page }) => {
    await page.goto("/");
    expect(await bodyText(page)).toContain("(408) 758-3800");
    await page.getByRole("button", { name: "Español" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Vea si la regla de trabajo de CalFresh le aplica a usted",
    );
    await page.getByRole("link", { name: "Vea si la regla le aplica" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Tiene usted menos de 18 años, o 65 años o más?");
  });
});
