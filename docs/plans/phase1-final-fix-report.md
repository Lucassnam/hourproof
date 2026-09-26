# Phase 1 final-review fix wave: report

Branch `phase-1`, starting at 69c9af8. Nothing pushed or deployed; no `vercel`.

## Commits

| SHA | Subject | Findings |
|---|---|---|
| ee90202 | rules: Spanish rule texts, question-screen hints, validUntil, generalSourceUrl | C1, I1 (data/schema/engine), I2, M2 (data) |
| 578bc3b | theme: border token (>=3:1 non-text) on buttons; base-layer heading font | M5, M9 (style prerequisite) |
| e39f255 | screener: SSR question 1, no-JS paths, language switch, result fixes | I1 (UI), I3, I5, I6, M1, M2 (UI), M3, M9, M10, M12, M14, e2e |
| c27dd6f | docs: rewrite README for the CalFresh screener (I4); add .nvmrc | I4 |
| 96ab847 | ui: center wrapped button labels; re-capture phase 1 screenshots | screenshot fix + captures |
| 6e1dc3f | docs(AI-USE): rows for the final-review fix wave | AI-USE |

## Per finding

### C1: Spanish screener showed English rule texts
- **Changed:** `rules/ca-calfresh-2026.json`: `question_es` and `proofThatHelps_es` for all 18 rules (17 have a proof; veteran has none after I1), `hint_es` for the 6 rules with a `hint_en`. Plain usted form, "/a" forms where a gendered word was unavoidable (exento/a, solo/a, inscrito/a, veterano/a, indígena americano/a). No text claims "exento/a"; age uses "NO están exentas solo por su edad". "Report within 10 days" kept: "repórtelo al condado dentro de 10 días". `meeting_80_hours` keeps "Esto NO es una exención". `sourceQuote`, `sourceUrl`, `confidence`, `kind`, `outcomeIfYes` and order are unchanged (the generator script asserted this for all 7 protected fields per rule; `git diff` shows no `-` line for any of them).
- **Tests:** `src/lib/rules/__tests__/real-file.test.ts:58-68` (per rule: `question_es` present, `proofThatHelps_es` present where `proofThatHelps_en` exists, `hint_es` present where `hint_en` exists, and `ruleText(rule,'es')` has no fallback flag). e2e `e2e/screener.spec.ts:157` (after Español, Q1 heading is exactly "¿Tiene usted menos de 18 años, o 65 años o más?", Spanish hint visible, no "(solo en inglés)", no "Are you under 18") and `:168` (walks every Spanish question to the subject result; every heading starts with "¿" or "En este momento", no "(solo en inglés)" anywhere).
- **Evidence:** RED run against the old content (all `question_es` null): 18 of 18 per-rule tests failed (`Tests 20 failed | 35 passed`, exit 1, 2 of them the M1 test below); GREEN after restore. Screenshots `question-es-*.png`, `result-es-*.png`, `question-es-veteran-hint-light.png` show no English rule text (the only English on those screens is the proper name "Santa Clara County").
- **AI-USE:** row added: "Spanish rule texts drafted by AI, need native + caseworker review."

### I1: proof text written for the question screen
- **Changed:** schema `src/lib/rules/schema.ts:14-15` (`hint_en` optional, `hint_es` nullable-optional), `:20-21` (`proofThatHelps_en` optional but `min(1)` when present), `:28-33` (`_es` without `_en` is rejected). Engine `ruleText` `src/lib/rules/engine.ts:71-85` returns `hint`, `hintFallback`, and `proof: null` when absent. UI: hint under the question `src/app/screener/Screener.tsx:137-142`; Result hides the "What proof helps" heading and text when there is no proof `src/app/screener/Result.tsx:53-61`.
- **Relocations (verbatim, English unchanged; generator asserted every old sentence still exists in hint_en + proofThatHelps_en):**

| Rule | Moved to `hint_en` | `proofThatHelps_en` now |
|---|---|---|
| age_scope | "The rule stops on the first day of the month you turn 65. Ages 60 to 64 are NOT exempt because of age alone, so keep answering the questions." | "The county already has your birth date." |
| waived_county_scope | "Santa Clara County is NOT on this list." | "No proof needed. This waiver ends October 31, 2026." |
| child_under_14_calfresh_household | "The child does not need to get CalFresh. A child you babysit who lives in another household does not count." | "Usually nothing extra. The county uses the child listed on your CalFresh application." |
| pregnant | "Any stage of pregnancy counts." | "Telling the county is usually enough." |
| care_incapacitated_person | "They do not have to live with you." | "Tell the county who you care for. Only one adult can use this for the same person." |
| veteran_info | "Being a veteran is no longer an exemption by itself. If you get any VA disability benefit, go back and answer yes to the disability benefits question." | (none; field absent) |

  The other 12 rules had no question-time sentences and are unchanged in English. Judgment calls: "Only one adult can use this…" (incapacitated person, child under 6) stays on the result as a caveat; "These are not exemptions on their own." (unfit indicators) and "This is NOT an exemption." (meeting) stay on the result because the ruling stresses not-an-exemption wording there.
- **Tests:** `schema.test.ts:21-27` (no proof accepted, empty proof rejected, `_es` without `_en` rejected, hints accepted/empty rejected), `engine.test.ts:136` block (hint es/en/fallback, null hint and proof never flagged), `real-file.test.ts:97` (veteran is `continue`, guidance in hint), e2e `:199` (age hint on Q1; age result shows "The county already has your birth date." and not "keep answering the questions") and `:210` (veteran hint on its question; "Not sure" there shows no "What proof helps").

### I2: waived-county rule expires Oct 31, 2026
- **Changed:** schema `validUntil` `src/lib/rules/schema.ts:26`. Engine `src/lib/rules/engine.ts:15-27` `californiaDate(now)`, `:31-34` `activeRules(set, now)`, `:36` `nextStep(set, answers, now = new Date())`, `:50` `goBack(set, answers, now = new Date())` (uses the same active list, so index math and the "previous question" skip the expired rule). `rules/ca-calfresh-2026.json:39` `"validUntil": "2026-10-31"`.
- **validUntil source:** the rule's own `sourceQuote` (unchanged): "The ABAWD Work Requirement is waived from November 1, 2025 **through October 31, 2026** for the following counties: Alpine Colusa Imperial Merced Monterey Plumas Tulare". Corroborated by `docs/research/calfresh-rules-verification.md:69` (row 16: "through Oct 31, 2026"; A15/CDSS ACL 26-15: "effective November 1, 2025, through October 31, 2026"). `real-file.test.ts:71-75` asserts the quote contains "through October 31, 2026".
- **Date semantics (flag for review):** "now's date" is the **California (America/Los_Angeles) calendar date**, and `validUntil` is inclusive. Reason: the server render and the browser must agree on the question count ("Question 1 of 18" vs "of 17"), or hydration mismatches in the hours when UTC and Pacific dates differ. Falls back to the UTC date if `Intl` time zones throw.
- **Tests:** `engine.test.ts:97-134` (10 tests: California date at 23:30 PDT Oct 31 is still Oct 31; asked on Oct 31; skipped on Nov 1 with `total` 3 instead of 4; stale answer to a skipped rule ignored; all-no after the date is `subject`; goBack from the question after the skipped rule, from a result across it, two steps across it, before the date, and from the all-no result). `real-file.test.ts:77-85` (real file: asked at 23:30 PDT Oct 31 with total 18, skipped at 00:30 PDT Nov 1 with total 17) and `:87` (only this rule is time-limited).
- **e2e time bomb removed:** three existing tests counted fixed "No" answers (17, and 3 before "pregnant"), which would click the wrong question from Nov 1. They now call `answerNoUntil(page, /pregnant/i)` / `answerNoUntil(page, MEETING_EN)` (`e2e/screener.spec.ts:19-30`). Their assertions are unchanged.

### I3: /screener blank without JS and before hydration
- **Changed:** `if (!hydrated) return null` removed; state starts at `{}` on server and first client render, saved answers restored in the mount effect, persistence gated on `restored` (`Screener.tsx:47-66`). Bilingual `<noscript>` with county name and a `tel:` link: `src/components/ui/NoScriptNotice.tsx` (uses `getTranslations({locale:'en'|'es'})`; `src/i18n/request.ts:12-22` now honors that explicit locale), rendered on `/` (`src/app/page.tsx:19`) and `/screener` (`src/app/screener/page.tsx:17`). Home is now a Server Component; its language buttons are a `<form action={setLocale}>` (`src/app/page.tsx:21-44`) posting to the Server Action `src/app/actions.ts` (sets `NEXT_LOCALE` for a year, `SameSite=Lax`, then `redirect(returnTo, replace)`; `returnTo` restricted to same-site paths). With JS, Next runs it as a Server Action and re-renders in place; without JS it is a 303. `Button.tsx` lost `"use client"` (no hooks) so the server home can call `buttonClasses()`.
- **Tests:** e2e `describe("without JavaScript")` `e2e/screener.spec.ts:301-328`: `/screener` shows "Question 1 of", the Q1 text, both notice sentences, "Santa Clara County", "(408) 758-3800" and a visible `tel:+14087583800` link; home shows the phone, and tapping "Español" with JS off reloads the home in Spanish and the screener opens with the Spanish Q1. The existing reload-on-Q3 and blocked-sessionStorage tests still pass (restore path).
- **Evidence:** capture run reported "no console errors or warnings" (listens for pageerror and console error/warning on every page, so no hydration mismatch). Screenshots `noscript-screener-light.png`, `noscript-home-light.png`.

### I4: README
- **Changed:** `README.md` rewritten: one paragraph (H.R. 1 80-hour rule, screener, hour log, kitchen QR check-in, proof packet, Congressional App Challenge CA-16); setup `nvm use` (Node 20.9+), `npm ci`, `npx playwright install chromium` with the `node node_modules/@playwright/test/cli.js install chromium` fallback, `npm test`, `npm run build`, `npm run e2e`, `npm run dev`; shim note; "Safety" section on the `reviewedAt` gate. Added `.nvmrc` (`24`) because `nvm use` with no argument needs it.
- **Test:** docs only.

### I5: Source link 32px
- **Changed:** `Result.tsx:81` `inline-flex min-h-12 items-center self-start text-lg`.
- **Test:** e2e `:229` asserts the Source link's bounding box height >= 48.

### I6: no way out of the screener
- **Changed:** Back on question 1 calls `router.push("/")` (`Screener.tsx:79-84`). `src/components/ui/LanguageSwitch.tsx`: compact `EN | ES` form (same Server Action, so it also works without JS), each button `min-h-12 min-w-12`, localized `aria-label` ("Switch to Spanish" / "Cambiar a español", etc.), `aria-current="true"` on the current language, `lang` on each button. Mounted in the `Screen` header next to ThemeToggle (`Screen.tsx:16`).
- **Choice to review:** the home page passes `languageSwitch={false}` because it already has the large English/Español buttons; every other screen shows the compact switch.
- **Tests:** e2e `:258` (Back on Q1 lands on `/` with the CTA visible); `:266` (answer two, on "Question 3 of"; the ES button box is >= 48x48; after tapping it "Pregunta 3 de" shows, the heading changed and starts with "¿", no "(solo en inglés)", "Cambiar a español" has `aria-current="true"`; switching back shows "Question 3 of" with the original English heading). Answers survived both switches.

### M1: "Ellos confirmarán si usted está exento"
- **Changed:** `result.possibly_exempt.body` is now en "Tell your county about your situation. They will check whether the rule applies to you." / es "Cuéntele a su condado su situación. Ellos revisarán si la regla le aplica a usted." (no exempt claim at all). My first rewording ("…whether you may be exempt") broke the existing e2e `getByText("You may be exempt")` (strict mode, 2 matches), so I reworded the copy rather than the test. Also es `possibly_exempt.title` / `likely_exempt.title` now "exento/a" and `becauseUnsure` "seguro/a"; "Es probable que usted esté exento" remains a substring of the gated title, so absence checks still cover it.
- **Tests:** `src/lib/i18n/__tests__/exempt-wording.test.ts`: every en/es message value (except `result.likely_exempt.*`) and every rule `question/hint/proofThatHelps` `_en/_es` text matching `/exempt|exent/i` must match `/may|might|not|NOT|posible|puede|no /i`; a guard test fails if fewer than 4 texts are checked. RED against the old messages: `en.result.possibly_exempt.body` and `es.result.possibly_exempt.body` failed. e2e `:185`: Spanish pregnant path shows "Es posible", not "Es probable que usted esté exento", the Spanish proof, and no "(solo en inglés)".

### M2: subject result's Source pointed at the IHSS contacts PDF
- **Changed:** top-level `generalSourceUrl` (`rules/ca-calfresh-2026.json:5`, schema `:41`, required). `Result.tsx:37` uses `rule.sourceUrl` when a rule decided the result, else `generalSourceUrl`; `county.sourceUrl` is no longer shown as Source.
- **Tests:** `real-file.test.ts:90-95` (equals the ACL 26-29 URL and is used by at least one rule); `schema.test.ts:19` (missing is rejected); e2e `:229` (subject result's Source `href` is the ACL 26-29 URL).

### M3: subject copy overstated
- **Changed:** en title "The rule likely applies to you. At your next CalFresh renewal, you may need 80 hours a month of work, volunteering or an approved program."; body "Start tracking your hours now so you have proof if your county asks. Ask your county when it starts for you." es mirrored ("En su próxima renovación de CalFresh, es posible que necesite…" / "Pregúntele a su condado cuándo empieza para usted.").
- **Tests:** e2e `:229` (both English sentences), `:168` (Spanish title fragment on the Spanish subject result).

### M5: buttons barely looked like buttons
- **Changed:** `border` token `src/lib/theme/tokens.ts` light `#768091`, dark `#6B7688`; `globals.css` `--border` in `:root` and `[data-theme="dark"]`, `--color-border` in `@theme`. 2px `border-border` on primary buttons (Yes/No/Not sure, CTA, call button, current home language) `Button.tsx:24-26`, the theme toggle, the current-language pill in the header switch, and the no-JS notice's divider. Ghost (underlined text) buttons are not bordered (choice to review).
- **Contrast (measured):** light border on bg 3.72, surface 3.99, surface-2 3.52; dark on bg 4.12, surface 3.76, surface-2 3.35.
- **Tests:** `contrast.test.ts:17-22` (border vs bg/surface/surface-2 >= 3.0 in both themes); `css-sync.test.ts:17` (border added to the synced list); e2e `:245` (computed border width >= 1px on "Yes" and on the call link).

### M9: "What proof helps" as h2
- **Changed:** `Result.tsx:55` `<h2 className="mt-3 font-sans text-lg font-semibold text-text">`. To keep the old look, the `h1,h2,h3 { font-family: display }` rule in `globals.css` moved into `@layer base` (an unlayered rule would beat the `font-sans` utility).
- **Test:** e2e `:223` `getByRole("heading", { level: 2, name: "What proof helps" })`.

### M10: phone number wrapping
- **Changed:** `common.callCounty` is now "Call your county: <num>{phone}</num>" (es likewise), rendered with `t.rich` and `<span className="whitespace-nowrap">` (`Result.tsx:70-75`). Also added `text-center` to `buttonClasses` after the screenshots showed the now two-line label left-aligned.
- **Test:** e2e `:245` (`white-space: nowrap` on the "(408) 758-3800" span).

### M12: e2e port
- **Changed:** `package.json:13` `"start:e2e": "next start -p 7051"`; `playwright.config.ts:10,14,15` base URL and webServer on 7051. `scripts/measure-js.mjs` does not depend on the e2e port and keeps 7050.
- **Evidence:** e2e and measure-js both ran; listeners on 7050/7051 = 0 after each (below).

### M14: apple-touch-icon
- **Changed:** `public/apple-touch-icon.png` (180x180, opaque RGB, `rsvg-convert -w 180 -h 180 -b "#F6F7F9" scripts/icon-source.svg`); `src/app/layout.tsx:15` `icons.apple`.
- **Test:** e2e `:292` (`<link rel="apple-touch-icon" href="/apple-touch-icon.png">` present; GET returns 200 `image/png`). I looked at the PNG: same clock-ring icon as the existing ones (the earlier-flagged checkmark legibility concern carries over).

### Also changed (within the non-negotiables)
- Body text that was `text-base` (16px) in the screener and result (question counter, "You answered yes to", proof, not-a-decision line, Source) is now `text-lg` (18px) per "body 18px+".

## Commands and real output

All run on the final code (after the `text-center` change; the later commits are docs/screenshots only). Output captured to files, exit code from `$?` of the unpiped command.

```
$ lsof -nP -iTCP:7050 -iTCP:7051 -sTCP:LISTEN   # before verification
(a leftover next-server from my own screenshot run was on 7051, PID 30466; killed it)
listeners: 0

$ npm test
 Test Files  8 passed (8)
      Tests  168 passed (168)
npm test exit 0

$ npm run typecheck
> tsc --noEmit
typecheck exit 0

$ npm run build
(prebuild) Test Files  3 passed (3) / Tests  90 passed (90)
▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 585ms
✓ Generating static pages using 6 workers (5/5) in 310ms
Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ○ /manifest.webmanifest
└ ƒ /screener
build exit 0

$ npm run e2e
Running 20 tests using 6 workers
  ✓ English: answering no to everything until meeting_80_hours, then yes, shows the meeting-requirement result
  ✓ Pregnant path shows possibly-exempt result and never shows 'likely exempt' text
  ✓ Back after a result returns to the question that produced it, not the result
  ✓ Reloading on question 3 resumes at question 3
  ✓ Spanish: shows 'Sí' and the Spanish not-a-decision line on a result
  ✓ Unsure on question 1 leads to the ask-county result with a tel: link
  ✓ A blocked sessionStorage does not break the screener
  ✓ C1: Spanish question 1 is in Spanish, with no '(solo en inglés)' tag
  ✓ C1: every Spanish question and the final result have no English rule text
  ✓ M1: Spanish possibly-exempt result is conditional and never says 'Es probable que usted esté exento'
  ✓ I1: question-time guidance shows as a hint on the question, not on the result
  ✓ I1: the veteran hint shows on its question; unsure there shows no empty 'What proof helps'
  ✓ M9: 'What proof helps' is an h2
  ✓ M2 + M3 + I5: the subject result uses the general CDSS source, hedged copy and a 48px Source link
  ✓ M5 + M10: buttons have a visible border and the phone number never wraps
  ✓ I6: Back on question 1 goes home
  ✓ I6: switching language mid-screener keeps the question number and shows Spanish
  ✓ M14: the apple-touch-icon is linked and served
  ✓ without JavaScript › I3: /screener shows question 1 and the bilingual call-your-county notice
  ✓ without JavaScript › I3: the home page shows the notice and its language choice works
  20 passed (8.8s)
e2e exit 0
listeners after e2e: 0

$ node scripts/measure-js.mjs
| Route | JS KB | Document KB | Total KB |
|---|---|---|---|
| `/` | 150.4 | 6.0 | 341.2 |
| `/screener` | 149.1 | 11.7 | 344.7 |
RESULT: all measured routes are within the 200 KB JS budget.
measure exit 0
listeners after measure: 0
$ pgrep -fl "next start|next-server"
no next processes
```

RED evidence (before GREEN), old content restored afterwards:
```
$ node node_modules/vitest/vitest.mjs run src/lib/i18n src/lib/rules/__tests__/real-file.test.ts   # old messages, all question_es null
 × en.result.possibly_exempt.body is hedged
 × es.result.possibly_exempt.body is hedged
 × age_scope … meeting_80_hours: question_es, proofThatHelps_es and hint_es are present where English exists  (18 of 18)
 Test Files  2 failed | 1 passed (3)
      Tests  20 failed | 35 passed (55)
exit 1
```

Earlier iteration: the first full e2e run failed 1 of 20 ("Back after a result…", strict-mode double match on "You may be exempt" caused by my first M1 wording); fixed by rewording the copy, not the test. Unit test count went 170 → 168 at that point because the two reworded bodies no longer mention "exempt", so the per-key wording tests for them no longer exist.

## JS KB per route
`/` 150.4 KB, `/screener` 149.1 KB (transferred; budget 200). Documents 6.0 / 11.7 KB; totals 341.2 / 344.7 KB.

## Screenshots (docs/screenshots/phase1/, 360x740, re-captured from the final build on :7051; each one read)

Capture script: `.superpowers/capture-screens.mjs` (gitignored). It collects every pageerror and console error/warning on every page and prints them; result: "no console errors or warnings".

| File | Checked |
|---|---|
| home-light / home-dark | Large English/Español buttons (current one bordered), no compact switch, bordered CTA, theme toggle bordered |
| noscript-home-light | Bilingual notice at top with "Santa Clara County, (408) 758-3800" (underlined tel link) in both languages; page still usable |
| noscript-screener-light | Same notice; Q1 "Question 1 of 18", English question, hint, three bordered choices rendered server-side |
| question-light / question-dark | EN current (bordered pill), ES underlined; Q1 + age hint; borders visible in both themes |
| question-es-light / question-es-dark | "Pregunta 1 de 18", Spanish Q1 and Spanish hint, "Sí / No / No estoy seguro", no "(solo en inglés)", no English rule text |
| question-veteran-hint-light | Q17 veteran with the relocated hint under it |
| question-es-veteran-hint-light | "¿Es usted veterano/a?" with Spanish hint; no English |
| result-not_subject-light/dark | "You answered yes to: Are you under 18…", proof now only "The county already has your birth date." (no "keep answering"), h2 look unchanged, not-a-decision line, centered nowrap phone, Source |
| result-possibly_exempt-light/dark | "You may be exempt. Ask your county to confirm.", new body, proof "Telling the county is usually enough.", no "likely exempt" |
| result-meeting_requirement-light/dark | Meeting copy, "This is NOT an exemption…report it to the county within 10 days." |
| result-subject-light/dark | New M3 title and body, no proof box, not-a-decision line, Source |
| result-ask_county-light/dark | "You weren't sure about: Are you under 18…", "What proof helps" + proof |
| result-es-light | Spanish ask_county: "No estaba seguro/a sobre: ¿Tiene usted…", "Qué prueba ayuda", Spanish proof, "Esto no es una decisión. Solo su condado puede decidir." |
| result-es-possibly_exempt-light/dark | "Es posible que usted esté exento/a…", "Ellos revisarán si la regla le aplica a usted.", Spanish proof, no "Es probable" |
| result-es-subject-light | Spanish M3 copy, "Llame a su condado: (408) 758-3800" centered on two lines, "Fuente" |
| result-es-meeting_requirement-light | Full Spanish question in the "Usted respondió que sí a" line and full Spanish proof including "dentro de 10 días" |

Spanish screens contain no English rule text; the only English words are the county's proper name "Santa Clara County" and the "EN" switch label. One real defect found by looking: the call button's wrapped label was left-aligned; fixed (`text-center`) and re-captured.

## Concerns
1. **`meeting_80_hours` + "Not sure" shows the wrong proof.** Since the earlier "proof on unsure" fix, answering "Not sure" to the 20-hours question gives ask_county with "This is NOT an exemption. The rule still applies to you, and you are meeting it…". "You are meeting it" contradicts "not sure". Pre-existing, not in this wave's list, and the English can't be reworded under this wave's rules, so I didn't fix it. Options: hide the proof on unsure for `info`/`meeting_requirement` rules, or split the proof. Needs a ruling.
2. **Spanish is an unreviewed AI draft** (rules and messages). Specific words to check: "dispensa/excepción" for the county waiver ("Esta excepción para estos condados termina…"), "talones de pago", "cuidado de crianza (foster care)", "título asociado (associate)". The "No estoy seguro" button stays masculine because existing e2e selects it by that exact name.
3. **The date uses California time** (inclusive through Oct 31 PDT), not the device's date. Deliberate so server and client agree; confirm it's what the controller meant by "now's date".
4. Choices made where the rulings didn't say: compact switch hidden on home; ghost buttons not bordered; 16px → 18px screener text; `.nvmrc` added (24).
5. The apple-touch-icon inherits the known checkmark-reads-as-arrowhead concern from the existing icon source.
