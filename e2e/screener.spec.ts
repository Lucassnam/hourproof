import { test, expect, type Page } from "@playwright/test";

// Screener v2 (Phase 2, Task 4): scope questions, one "Check any that apply" checklist, then
// the trailing info questions. Screen counts are read from the page, never hard-coded: the
// waived-county question (validUntil 2026-10-31) drops out on Nov 1, 2026.

const CHECKLIST_EN = "Do any of these apply to you?";
const CHECKLIST_ES = "¿Le aplica alguna de estas situaciones?";
const MEETING_EN = /Right now, do you work, volunteer or go to an approved program/;
const MEETING_ES = /^En este momento, ¿trabaja/;
const UNFIT_EN = /Has any of this happened to you/;
const NOT_DECISION_EN = "This is not a decision. Only your county can decide.";
const NOT_DECISION_ES = "Esto no es una decisión. Solo su condado puede decidir.";
const GENERAL_SOURCE = "https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2026/26-29.pdf";

async function goToScreener(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Check if the rule applies to you" }).click();
  await expect(page).toHaveURL(/\/screener$/);
}

async function chooseSpanishAndStart(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Español" }).click();
  await page.getByRole("link", { name: "Vea si la regla le aplica" }).click();
  await expect(page).toHaveURL(/\/screener$/);
}

async function answer(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function bodyText(page: Page): Promise<string> {
  return page.innerText("body");
}

// Every piece of text in the page body, visible or not (print-only lines, closed <details>),
// minus <script> contents (the RSC payload carries every message, including the gated ones).
async function wholePageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script").forEach((s) => s.remove());
    return clone.textContent ?? "";
  });
}

async function h1Text(page: Page): Promise<string> {
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible();
  return (await h1.textContent()) ?? "";
}

// Answers "No" until the level-1 heading matches `heading`. Returns how many screens were answered.
async function answerNoUntil(page: Page, heading: RegExp | string, no = "No"): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const text = await h1Text(page);
    if (typeof heading === "string" ? text === heading : heading.test(text)) return i;
    await answer(page, no);
  }
  throw new Error(`never reached a screen matching ${heading}`);
}

async function toChecklist(page: Page): Promise<number> {
  return answerNoUntil(page, CHECKLIST_EN);
}

async function check(page: Page, label: string) {
  await page.getByRole("checkbox", { name: label, exact: true }).check();
}

// The sticky bar's Continue button, labeled "Continue (n checked)" / "Continuar (n marcada/s)".
function continueButton(page: Page) {
  return page.getByRole("button", { name: /^(Continue \(\d+ checked\)|Continuar \(\d+ marcadas?\))$/ });
}

async function pressContinue(page: Page) {
  await continueButton(page).click();
}

function whatToBring(page: Page, name = "What to bring") {
  return page.getByRole("heading", { level: 2, name });
}

function script(page: Page) {
  return page.getByTestId("county-script");
}

// ---------------------------------------------------------------------------
// The 12 cases from the Task 4 brief
// ---------------------------------------------------------------------------

test("1: English subject path takes at most 5 screens and ends at 'Start tracking my hours'", async ({ page }) => {
  await goToScreener(page);

  let screens = await toChecklist(page);
  await answer(page, "None of these apply");
  screens += 1;
  screens += await answerNoUntil(page, /The rule likely applies to you/);

  expect(screens).toBeLessThanOrEqual(5);
  const text = await bodyText(page);
  expect(text).toContain("At your next CalFresh renewal, you may need 80 hours a month");
  expect(text).toContain("Start tracking now so you have proof ready.");
  expect(text).toContain(NOT_DECISION_EN);

  const track = page.getByRole("link", { name: "Start tracking my hours" });
  await expect(track).toBeVisible();
  await expect(track).toHaveAttribute("href", "/log");
  await expect(whatToBring(page)).toHaveCount(0);
  await expect(script(page)).toHaveCount(0); // countyScript() has none for `subject`
});

test("2: pregnant path gives 'You may be exempt', what to bring, and a script naming it", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);

  // Nothing checked yet: the sticky bar offers "None of these apply" and "I'm not sure" only.
  await expect(continueButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "None of these apply" })).toBeVisible();
  await check(page, "I'm pregnant");
  await expect(page.getByRole("button", { name: "Continue (1 checked)", exact: true })).toBeVisible();
  await pressContinue(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You may be exempt. Ask your county to confirm.");
  expect((await wholePageText(page)).toLowerCase()).not.toContain("likely exempt");
  expect((await bodyText(page)).toLowerCase()).not.toContain("likely exempt");
  await expect(whatToBring(page)).toBeVisible();
  await expect(page.getByText("Telling the county is usually enough.")).toBeVisible();
  await expect(script(page)).toContainText("I'm pregnant");
  await expect(page.getByText(NOT_DECISION_EN)).toBeVisible();
});

test("3: two exemptions checked show both labels under Why and both proofs under What to bring", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);

  await check(page, "I'm pregnant");
  await check(page, "I applied for or get unemployment benefits");
  await pressContinue(page);

  const why = page.locator("section", { has: page.getByRole("heading", { name: "Why" }) });
  await expect(why).toContainText("I'm pregnant");
  await expect(why).toContainText("I applied for or get unemployment benefits");

  const bring = page.locator("section", { has: whatToBring(page) });
  await expect(bring).toContainText("Telling the county is usually enough.");
  await expect(bring).toContainText("Your EDD claim confirmation or payment notice.");

  await expect(script(page)).toContainText("I'm pregnant; I applied for or get unemployment benefits");
});

test("4: Back from a checklist result reopens the checklist with the box still checked", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);

  await check(page, "I'm pregnant");
  await pressContinue(page);
  await expect(page.getByText("You may be exempt")).toBeVisible();

  await answer(page, "Back");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CHECKLIST_EN);
  const pregnant = page.getByRole("checkbox", { name: "I'm pregnant", exact: true });
  await expect(pregnant).toBeChecked();
  await expect(page.getByRole("button", { name: "Continue (1 checked)", exact: true })).toBeVisible();

  await pregnant.uncheck();
  await answer(page, "None of these apply");

  // The next question, not the result and not the checklist.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(UNFIT_EN);
  await expect(page.getByText("You may be exempt")).toHaveCount(0);
});

test("5: 'Not sure' on the 20-hours question never says 'you are meeting it' (English)", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await answer(page, "None of these apply");
  await answerNoUntil(page, MEETING_EN);
  await answer(page, "Not sure");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't tell from your answers. Your county can.");
  const text = await wholePageText(page);
  expect(text).not.toContain("you are meeting it");
  expect(text).not.toContain("you're meeting it");
  expect(text).not.toContain("This is NOT an exemption");
  await expect(whatToBring(page)).toHaveCount(0);
  await expect(script(page)).toContainText("not sure");
  await expect(page.getByText(/You weren't sure about: Right now, do you work/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Track hours while you check" })).toHaveAttribute("href", "/log");
});

test("5 (es): 'No estoy seguro' on the 20-hours question never says 'lo está cumpliendo'", async ({ page }) => {
  await chooseSpanishAndStart(page);
  await answerNoUntil(page, CHECKLIST_ES);
  await answer(page, "Ninguna de estas me aplica");
  await answerNoUntil(page, MEETING_ES);
  await answer(page, "No estoy seguro");

  const text = await wholePageText(page);
  expect(text).toContain("No podemos saberlo con sus respuestas.");
  expect(text).not.toContain("lo está cumpliendo");
  expect(text).not.toContain("la está cumpliendo");
  await expect(whatToBring(page, "Qué llevar")).toHaveCount(0);
  await expect(script(page)).toContainText("No estoy seguro/a");
  expect(text).toContain(NOT_DECISION_ES);
});

test("6: checklist 'I'm not sure' with nothing checked goes to ask-county with the county tel: link", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await answer(page, "I'm not sure");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't tell from your answers. Your county can.");
  await expect(page.getByText("You weren't sure about: the list of situations")).toBeVisible();
  await expect(whatToBring(page)).toHaveCount(0);
  const tel = page.locator('a[href^="tel:"]');
  await expect(tel).toBeVisible();
  await expect(tel).toHaveAttribute("href", "tel:+14087583800");
});

// Fix round 1 ruling: with a box checked, the sticky bar holds only "Continue (n checked)";
// "I'm not sure" with boxes checked (which the engine maps to the same may-be-exempt result)
// is no longer offered. Unchecking every box brings the two buttons back.
test("6b: checking boxes swaps the bar to 'Continue (n checked)'; unchecking brings the two buttons back", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await check(page, "I applied for or get unemployment benefits");
  await expect(page.getByRole("button", { name: "Continue (2 checked)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "None of these apply" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I'm not sure" })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "I'm pregnant", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "I applied for or get unemployment benefits", exact: true }).uncheck();
  await expect(continueButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "None of these apply" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm not sure" })).toBeVisible();
});

test("6c: the sticky bar stays on screen while scrolling, never covers the last row, and is hidden in print", async ({
  page,
}) => {
  await goToScreener(page);
  await toChecklist(page);
  const bar = page.getByTestId("checklist-actions");
  const viewport = page.viewportSize()!;

  // At the top of a long list, the bar is pinned to the bottom of the screen.
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = await bar.boundingBox();
  expect(Math.round((top?.y ?? 0) + (top?.height ?? 0))).toBeLessThanOrEqual(viewport.height);
  expect(Math.round((top?.y ?? 0) + (top?.height ?? 0))).toBeGreaterThanOrEqual(viewport.height - 2);

  // At the end, the last row is fully above the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastRow = page.locator("fieldset ul > li").last();
  const rowBox = await lastRow.boundingBox();
  const barBox = await bar.boundingBox();
  expect((rowBox?.y ?? 0) + (rowBox?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0);

  await page.emulateMedia({ media: "print" });
  await expect(bar).toBeHidden();
});

test("7: Spanish checklist and result are all Spanish", async ({ page }) => {
  await chooseSpanishAndStart(page);
  await answerNoUntil(page, CHECKLIST_ES);

  await expect(page.getByText("Marque todas las que le apliquen.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Estoy embarazada", exact: true })).toBeVisible();
  expect(await wholePageText(page)).not.toContain("(solo en inglés)");
  await expect(page.getByText('marque "Solicité o recibo un beneficio por discapacidad" arriba.')).toBeVisible();
  expect(await wholePageText(page)).not.toContain("regrese y responda");

  await check(page, "Estoy embarazada");
  await pressContinue(page);

  const text = await wholePageText(page);
  expect(text).toContain(NOT_DECISION_ES);
  expect(text).toContain("Es posible");
  expect(text).not.toContain("Es probable que usted esté exento");
  expect(text).toContain("Por lo general, basta con decírselo al condado.");
  expect(text).not.toContain("(solo en inglés)");
  await expect(whatToBring(page, "Qué llevar")).toBeVisible();
  await expect(script(page)).toContainText("Estoy embarazada");
});

test("8: reload keeps the checklist position and the boxes, before Continue and after Back", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  const position = await page.getByText(/^Question \d+ of \d+$/).textContent();

  await check(page, "I'm pregnant");
  await check(page, "I'm in CalWORKs and following its work rules");
  await page.reload();

  // Position persists, and so do the unsubmitted boxes (kept as a draft in sessionStorage).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CHECKLIST_EN);
  await expect(page.getByText(position ?? "")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "I'm pregnant", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "I'm in CalWORKs and following its work rules", exact: true })).toBeChecked();

  await pressContinue(page);
  await expect(page.getByText("You may be exempt")).toBeVisible();
  await answer(page, "Back");
  await page.reload();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CHECKLIST_EN);
  await expect(page.getByRole("checkbox", { name: "I'm pregnant", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "I'm in CalWORKs and following its work rules", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "I'm in school or training at least half-time", exact: true })).not.toBeChecked();
});

test("8b: answers saved under another rules version are dropped", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        sessionStorage.setItem(
          "hp.screener.v2",
          JSON.stringify({ rulesVersion: "old-version", answers: { age_scope: "no", waived_county_scope: "no" } }),
        );
      }
    } catch {}
  });
  await page.goto("/screener");
  await expect(page.getByText("Question 1 of")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Are you under 18, or 65 or older?");
  // A saved position under the current version does restore.
  await answer(page, "No");
  await page.reload();
  await expect(page.getByText("Question 2 of")).toBeVisible();
});

test("9: a blocked sessionStorage does not break the screener, checklist or result", async ({ page }) => {
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
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await pressContinue(page);
  await expect(page.getByText("You may be exempt")).toBeVisible();

  expect(errors).toEqual([]);
});

test("11: printing a result hides the buttons and keeps the script, phone, date and not-a-decision line", async ({
  page,
}) => {
  await goToScreener(page);
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await pressContinue(page);
  await expect(page.getByText("You may be exempt")).toBeVisible();

  await page.emulateMedia({ media: "print" });

  // A CSS locator, not getByRole: display:none buttons leave the accessibility tree entirely.
  const buttons = page.locator("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toBeHidden();
  await expect(page.locator('a[href^="tel:"]')).toBeHidden();
  await expect(page.getByRole("link", { name: "Source" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Switch to Spanish" })).toBeHidden();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(script(page)).toBeVisible();
  await expect(script(page)).toContainText("I'm pregnant");
  await expect(whatToBring(page)).toBeVisible();
  await expect(page.getByText("Santa Clara County")).toBeVisible();
  // The phone as plain text (the call button, which also shows it, is hidden on paper).
  await expect(page.locator("p").filter({ hasText: /^\(408\) 758-3800$/ })).toBeVisible();
  await expect(page.getByText(/^Date: [A-Z][a-z]+ \d{1,2}, \d{4}$/)).toBeVisible();
  await expect(page.getByText(NOT_DECISION_EN)).toBeVisible();

  await page.emulateMedia({ media: "screen" });
  await expect(page.getByText(/^Date: /)).toBeHidden();
  await expect(page.getByRole("button", { name: "Print or save this page" })).toBeVisible();
});

test("12: switching language on the checklist keeps the position and the checked box", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  const n = (await page.getByText(/^Question \d+ of \d+$/).textContent())?.match(/Question (\d+)/)?.[1];
  await check(page, "I'm pregnant");

  const es = page.getByRole("button", { name: "Switch to Spanish" });
  const box = await es.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  await es.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CHECKLIST_ES);
  await expect(page.getByText(`Pregunta ${n} de`)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Estoy embarazada", exact: true })).toBeChecked();
  expect(await bodyText(page)).not.toContain("(solo en inglés)");
  await expect(page.getByRole("button", { name: "Cambiar a español" })).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: "Cambiar a inglés" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CHECKLIST_EN);
  await expect(page.getByText(`Question ${n} of`)).toBeVisible();
});

test("12b: switching language on a question keeps the question number and shows Spanish", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await answer(page, "None of these apply");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(UNFIT_EN);
  const n = (await page.getByText(/^Question \d+ of \d+$/).textContent())?.match(/Question (\d+)/)?.[1];
  const english = await h1Text(page);

  await page.getByRole("button", { name: "Switch to Spanish" }).click();
  await expect(page.getByText(`Pregunta ${n} de`)).toBeVisible();
  const spanish = page.getByRole("heading", { level: 1 });
  await expect(spanish).not.toHaveText(english);
  await expect(spanish).toHaveText(/^¿/);
  expect(await bodyText(page)).not.toContain("(solo en inglés)");

  await page.getByRole("button", { name: "Cambiar a inglés" }).click();
  await expect(page.getByText(`Question ${n} of`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(english);
});

// ---------------------------------------------------------------------------
// Result details
// ---------------------------------------------------------------------------

test("meeting the requirement: 'you're meeting it', start tracking, no what to bring", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await answer(page, "None of these apply");
  await answerNoUntil(page, MEETING_EN);
  await answer(page, "Yes");

  const text = await bodyText(page);
  expect(text).toContain("you're meeting it");
  expect(text).toContain(NOT_DECISION_EN);
  await expect(page.getByRole("link", { name: "Start tracking my hours" })).toHaveAttribute("href", "/log");
  await expect(whatToBring(page)).toHaveCount(0);
});

test("the Copy button copies the script and says Copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await goToScreener(page);
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await pressContinue(page);

  await answer(page, "Copy");
  await expect(page.getByRole("status")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("I'm pregnant");
  expect(copied).toContain("Can you check my case?");
});

test("the Copy button is hidden when the Clipboard API is missing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => undefined });
  });
  await goToScreener(page);
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await pressContinue(page);
  await expect(script(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
});

test("checklist rows are at least 56px tall, labels use the full width, and 'More about this' shows the full question", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);

  const rows = page.locator("ul > li > label");
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < n; i++) {
    const box = await rows.nth(i).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  }

  const summary = page.locator("summary", { hasText: "More about this" }).first();
  const sbox = await summary.boundingBox();
  expect(sbox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const pregnantRow = page.locator("fieldset ul > li").filter({ has: page.getByRole("checkbox", { name: "I'm pregnant", exact: true }) });
  await pregnantRow.locator("summary").click();
  await expect(page.getByText("Any stage of pregnancy counts.")).toBeVisible();
  await expect(page.getByText("Are you pregnant?")).toBeVisible();
  // Labels span the row: "I'm pregnant" is one line, and most English labels fit on 1-2 lines.
  let twoLinesOrFewer = 0;
  for (let i = 0; i < n; i++) {
    const lines = await rows.nth(i).locator("span").first().evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    if (lines <= 2) twoLinesOrFewer++;
  }
  expect(twoLinesOrFewer).toBeGreaterThanOrEqual(Math.ceil(n * 0.75));
  // Opening the disclosure does not check the box.
  await expect(page.getByRole("checkbox", { name: "I'm pregnant", exact: true })).not.toBeChecked();
});

test("I1 (v2): the veteran note shows on the checklist; checklist 'not sure' shows no What to bring", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);

  await expect(page.getByText("Are you a veteran?")).toBeVisible();
  await expect(page.getByText("Being a veteran is no longer an exemption by itself.", { exact: false })).toBeVisible();
  // The checklist's own note (checklistNote_en), not the question-screen hint's "go back" wording.
  await expect(page.getByText('check "I applied for or get a disability benefit" above.', { exact: false })).toBeVisible();
  expect(await wholePageText(page)).not.toContain("go back and answer yes");
  await answer(page, "I'm not sure");

  const text = await bodyText(page);
  expect(text).toContain("You weren't sure about: the list of situations");
  expect(text).not.toContain("What to bring");
  expect(text).toContain(NOT_DECISION_EN);
});

test("I1: question-time guidance shows as a hint on the question, not on the result", async ({ page }) => {
  await goToScreener(page);

  await expect(page.getByText("Ages 60 to 64 are NOT exempt because of age alone")).toBeVisible();
  await answer(page, "Yes"); // age_scope -> not_subject

  const text = await bodyText(page);
  expect(text).toContain("You answered yes to: Are you under 18, or 65 or older?");
  expect(text).toContain("The county already has your birth date.");
  expect(text).not.toContain("keep answering the questions");
  await expect(whatToBring(page)).toHaveCount(0);
});

test("Unsure on question 1 leads to the ask-county result with a tel: link and no What to bring", async ({ page }) => {
  await goToScreener(page);
  await answer(page, "Not sure");

  const text = await bodyText(page);
  expect(text).toContain("Your county can");
  expect(text).toContain("You weren't sure about: Are you under 18, or 65 or older?");
  expect(text).not.toContain("The county already has your birth date."); // a proof is never shown for unsure
  await expect(whatToBring(page)).toHaveCount(0);
  await expect(script(page)).toContainText("I'm not sure if the CalFresh work rule applies to me.");

  const telLink = page.locator('a[href^="tel:"]');
  await expect(telLink).toBeVisible();
  await expect(telLink).toHaveAttribute("href", "tel:+14087583800");
});

test("M9 (v2): 'What to bring' is an h2", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await check(page, "I'm pregnant");
  await pressContinue(page);
  await expect(whatToBring(page)).toBeVisible();
});

test("M2 + M3 + I5: the subject result uses the general CDSS source, hedged copy and a 48px Source link", async ({ page }) => {
  await goToScreener(page);
  await toChecklist(page);
  await answer(page, "None of these apply");
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

// ---------------------------------------------------------------------------
// Spanish (Phase 1 C1 / M1, adapted)
// ---------------------------------------------------------------------------

test("Spanish: shows 'Sí' and the Spanish not-a-decision line on a result", async ({ page }) => {
  await chooseSpanishAndStart(page);
  await expect(page.getByRole("button", { name: "Sí" })).toBeVisible();
  await answer(page, "No estoy seguro");
  expect(await bodyText(page)).toContain(NOT_DECISION_ES);
});

test("C1: Spanish question 1 is in Spanish, with no '(solo en inglés)' tag", async ({ page }) => {
  await chooseSpanishAndStart(page);

  await expect(page.getByText("Pregunta 1 de")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Tiene usted menos de 18 años, o 65 años o más?");
  await expect(page.getByText("siga respondiendo las preguntas")).toBeVisible(); // Spanish hint
  const text = await bodyText(page);
  expect(text).not.toContain("(solo en inglés)");
  expect(text).not.toContain("Are you under 18");
});

test("C1: every Spanish screen and the final result have no English rule text", async ({ page }) => {
  await chooseSpanishAndStart(page);

  for (let i = 0; i < 10; i++) {
    const heading = await h1Text(page);
    const text = await wholePageText(page);
    expect(text).not.toContain("(solo en inglés)");
    if (!(await bodyText(page)).includes("Pregunta ")) break; // reached the result
    expect(heading).toMatch(/^(¿|En este momento)/);
    if (heading === CHECKLIST_ES) await answer(page, "Ninguna de estas me aplica");
    else await answer(page, "No");
  }
  const result = await bodyText(page);
  expect(result).toContain(NOT_DECISION_ES);
  expect(result).toContain("En su próxima renovación de CalFresh");
  await expect(page.getByRole("link", { name: "Empezar a registrar mis horas" })).toHaveAttribute("href", "/log");
});

// ---------------------------------------------------------------------------
// Navigation, icons, no-JS
// ---------------------------------------------------------------------------

test("I6: Back on question 1 goes home", async ({ page }) => {
  await goToScreener(page);
  await expect(page.getByText("Question 1 of")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Check if the rule applies to you" })).toBeVisible();
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

  test("10: /screener shows question 1 and the bilingual call-your-county notice", async ({ page }) => {
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
