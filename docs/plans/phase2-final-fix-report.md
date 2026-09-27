# Phase 2 final-review fix wave: report

Branch `phase-2`, from e8d9db6 to b514808 (11 commits). Nothing was pushed or deployed. Ports 7050 and 7051 are free: `lsof -ti :7050` and `lsof -ti :7051` both print nothing.

## Commits

| Commit | IDs | Summary |
|---|---|---|
| caf2e77 | I1 | `data-sticky-bar` on both bottom bars, `html:has([data-sticky-bar])` scroll padding set from the bar's measured height, tab-through e2e (en, es) |
| d7b1daf | M2 | Engine flag `job_search_no_program`, `doesNotCount()`, unit tests |
| a9cb218 | M11 | Checklist `wrap-anywhere`, a responsive ring, home language buttons wrap, `e2e/zoom.spec.ts` |
| 2e3854d | I2, M1, M2, M3, M6, M11 | `/log` copy (en and es), the offline line, `today` refresh, the new-entry date follows `today`, the month nav wraps, e2e updates |
| 6df5c9f | M5 | The demo reads back the mode flag and shows an inline alert when storage is blocked |
| 7d490a2 | M8 | `californiaDate` built with `formatToParts` |
| d87b663 | M9, M10 | `upgradeSchema` guarded by `oldVersion < 1`; a failed open is dropped from the cache |
| f87ca9e | M7 | Explicit hedge-phrase list in the exempt-wording test |
| 4e21773 | M4 | Stale comment removed |
| 31d6f5a | I3 | README rewrite, plus an AI-USE row for this wave |
| b514808 | none | Re-captured and new screenshots |

2e3854d mixes several IDs because they all touch `HourLog.tsx` and the message files, and interactive hunk staging isn't available here. The commit message lists each ID.

---

## Important

### I1: the sticky bar hid keyboard focus
- **Change:**
  - `src/components/ui/useStickyBar.ts` (new): measures the bar with a ResizeObserver and sets `--sticky-bar-h` on `<html>`. It removes the variable on unmount.
  - `src/app/globals.css:54-60`: `html:has([data-sticky-bar]) { scroll-padding-bottom: calc(var(--sticky-bar-h, 11rem) + 1rem); }`. This replaces the old `form[data-sticky-bar]` rule with its fixed 10rem.
  - `src/app/screener/Checklist.tsx:86-87,194-197`: the bar gets a ref, `data-sticky-bar` and the hook.
  - `src/app/log/EntryForm.tsx:82-83,419`: the attribute moved from `<form>` to the Save bar itself, and the hook added.
- **Why the value is measured, not a constant:** the first red run showed the checklist bar is 170px tall at 360×740 (bar top at 570). The old 10rem (160px) could never have cleared it. The bar's height also changes with language, font size and one versus two buttons.
- **Programmatic focus:**
  - Scroll-padding also applies to `focus()` scrolling. The e2e checks this by focusing the last checkbox from scrollTop 0.
  - The heading focus when the checklist opens is also asserted clear of the bar.
  - EntryForm's `focusVisible` (center) is unchanged.
- **Test:** `e2e/screener.spec.ts:534`, "I1 (final review, en|es)".
  - It tabs from the heading to the bar's last button.
  - For every stop, the element's bottom must be ≤ the top of `checklist-actions`, or the element must be inside the bar.
  - It also asserts at least 2 stops per row + 2.
  - Then it checks a programmatic `focus()`.
- **Evidence:**
  - Red before the fix: `tab stop 5: ex-health_limits_20h: bottom 572 vs bar top 570` (en), and `bottom 604 vs bar top 570` (es).
  - Green after the fix, and in the full e2e run.
- **Screenshots:** `checklist-tabfocus-viewport-{en,es}-light.png`. The blue focus ring on the "American Indian" / "indígena" checkbox sits well above the bar.

### I2: `/log` said "you need 80" as if the rule surely applies
Copy changes only. `HourLog.tsx` also stops passing the now-unused `perDayN` (`paceLine`, around line 380).

| Key | Before (en) | After (en) |
|---|---|---|
| `log.pace.behind` | You need {remaining} more {hour/hours} in {n days} — about {perDay} {hour/hours} a day. | To reach 80 this month: {remaining} more {hour/hours} in {n days} — about {perDay} a day. |
| `log.pace.behindLastDay` | You need {remaining} more {hour/hours}. Today is the last day of the month. | To reach 80 this month: {remaining} more {hour/hours}. Today is the last day of the month. |
| `log.rule.adds` | Work, volunteering and job programs add up. You need 80 hours a month. | If the rule applies to you, you need 80 hours a month. Work, volunteering and job programs add up. |

| Key | Before (es) | After (es) |
|---|---|---|
| `log.pace.behind` | Necesita {remaining} {hora/horas} más en {n días}: unas {perDay} {hora/horas} al día. | Para llegar a 80 este mes: {remaining} {hora/horas} más en {n días}, unas {perDay} al día. |
| `log.pace.behindLastDay` | Necesita {remaining} {hora/horas} más. Hoy es el último día del mes. | Para llegar a 80 este mes: {remaining} {hora/horas} más. Hoy es el último día del mes. |
| `log.rule.adds` | El trabajo, el voluntariado y los programas de empleo se suman. Necesita 80 horas al mes. | Si la regla le aplica, necesita 80 horas al mes. El trabajo, el voluntariado y los programas de empleo se suman. |

The non-breaking space before "—" in en `pace.behind` is kept, so a line never starts with the dash. `log.rule.report` changed as well (see M1).

**Other `/log` strings I checked and left as they are,** because none claims the rule applies:

| Key | Text | Why it stays |
|---|---|---|
| `pace.met` | "You have 80 hours this month. Keep proof of every hour." | Factual. Keeping proof is good advice either way. |
| `pace.on_track` | "On track. At this pace you'll reach {projected} hours." | Describes pace, not a duty. |
| `pace.not_started`, `pastMet`, `pastBehind`, `pastEmpty` | | Factual. |
| `empty` / `emptyWhat` | "What counts: paid work, volunteering…" | Says what counts toward 80, not that you must reach it. |
| `ring.*` | "of 80 hours", "Done for this month" | The ring's target, not a claim about the rule. |
| `notes.*` | | Say what counts; the workfare notes defer to the county. |
| `rule.jobSearch`, `checkRule` | | Already neutral or hedged. |
| `form.*` | | No claims. |

- **Tests:**
  - `e2e/log.spec.ts` test 1 (line 50) checks the exact new `rule.adds` and `rule.report` text.
  - Test 3 (line 126) matches `^To reach 80 this month: \d+ more hours( in …— about … a day\.|\. Today is the last day…)$` and asserts the body never contains "You need".
  - Test 6 (line 213) matches the Spanish regex `Para llegar a 80 este mes: …`.
  - `e2e/loop.spec.ts` checks the demo's pace regex.
- **Screenshots:** `log-behind{,-viewport}-{en,es}-{light,dark}.png` and `log-behind-rule-open-viewport-{en,es}-{light,dark}.png`. They show "To reach 80 this month: 72 more hours in 4 days — about 18 a day." / "Para llegar a 80 este mes: 72 horas más en 4 días, unas 18 al día.", with the new disclosure text.

### I3: the README was stale
- **Change:** `README.md` rewritten. It covers:
  - What the app does now: the 4 to 5 screen screener with next steps, the hour log with the 80-hour ring (offline), and demo mode.
  - Privacy: screener answers in sessionStorage, hours and notes in IndexedDB, the demo in its own database, nothing sent anywhere.
  - Commands: `npm ci`, `npm test`, `npm run build`, `npm run e2e`, `npm run build && npm run measure`.
  - A short Node 18 note.
  - The Safety section, kept, with one added sentence on the hedged `/log` copy.
- **Test:** none; it's documentation. Every claim was checked against the code and e2e. For example, I changed "every result lists proof" to "where they apply", because ask-county results have no What to bring.

---

## Minor

### M1: 10-day wording
- **Change:** `log.rule.report` in `messages/{en,es}.json`.
- **en:** "If the work rule applies to you and your hours drop below 20 a week, tell your county within 10 days." → "If the rule applies to you and your hours drop below 20 a week on average (80 a month), tell your county within 10 days."
- **es:** "Si la regla de trabajo le aplica y sus horas bajan a menos de 20 a la semana, avísele…" → "Si la regla le aplica y sus horas bajan a menos de 20 a la semana en promedio (80 al mes), avísele a su condado en un plazo de 10 días."
- **Test:** `e2e/log.spec.ts` test 1 checks the exact English text, hidden until the disclosure opens.
- **Screenshot:** the rule-open screenshots.

### M2: job search marked "in a program" with 0 program hours
- **Engine change:**
  - `src/lib/hours/types.ts:30-35`: new `Flag` value `job_search_no_program`.
  - `src/lib/hours/summarize.ts:~118-124`: when there is in-program job search and program hours are 0, it pushes `job_search_no_program`. `job_search_capped` is now in the `else` branch, so it is never set in that case.
- **Notes change (`src/app/log/notes.ts:16-22,30-42`):**
  - `NOTE_ORDER` includes the new note.
  - New `doesNotCount()`: true for job search outside a program, and for in-program job search in a `job_search_no_program` month.
  - `mayCountPartly()` still keys on `job_search_capped`, which now only happens when program hours are above 0.
- **Row tag:** `HourLog.tsx:289` uses `doesNotCount`.
- **New message:** `log.notes.job_search_no_program`.
  - en: "Job search counts only as part of a job program. None of these hours count this month."
  - es: "La búsqueda de trabajo solo cuenta como parte de un programa de empleo. Ninguna de estas horas cuenta este mes."
- **Tests (TDD, red then green):**
  - `src/lib/hours/__tests__/summarize.test.ts:41-56`, three tests: no-program flag instead of capped; capped instead of no-program; no flag without in-program job search.
  - `src/app/log/notes.test.ts:58-77`: the note, `doesNotCount` true and `mayCountPartly` false with 0 program hours; `doesNotCount` false and `mayCountPartly` true with program hours.
  - `e2e/log.spec.ts:164`, test 3c: the note, "Doesn't count", no "May count partly", no capped note.
  - The existing test 3b (capped, "May count partly") still passes.
- **Screenshot:** `log-jobsearch-no-program-{en,es}-light.png`. It shows the "Good to know" note and the "Doesn't count" tag on the job-search row, with the ring at 2.

### M3: offline line
- **Change:** `HourLog.tsx:~265-271` adds `<p data-testid="offline-note">` under "Add hours", in muted text-lg (18px), always rendered. It is left out only in the load-error state, where it would be false.
- **Text:** `log.offline`.
  - en: "Your hours stay saved on this phone, even without signal."
  - es: "Sus horas quedan guardadas en este teléfono, aunque no tenga señal."
- **Tests:** `e2e/log.spec.ts` test 1 (en text) and test 6 (es text).
- **Screenshots:** the log-behind screenshots.

### M4: stale comment
- **Change:** the comment at `src/app/screener/Result.tsx:~241` ("/log arrives in a later task …") is removed.
- **Test:** none needed. Typecheck, build and e2e are green.

### M5: demo with sessionStorage blocked
- **Change:** `src/components/ui/TryDemoButton.tsx:34-72`.
  - After `startDemo` (whose exceptions are now caught), it reads `getMode()` back.
  - If the mode isn't `'demo'`, it doesn't navigate and shows `<p role="alert">{home.demoNeedsStorage}</p>` in `text-danger`.
  - Before this, the button navigated in `finally` whatever happened.
- **Text:**
  - en: "The demo needs your browser to allow site storage."
  - es: "La demostración necesita que su navegador permita guardar datos del sitio."
- **Test:** `e2e/loop.spec.ts:90`. It blocks sessionStorage, clicks Try the demo, and checks for the alert, a URL still on `/`, no demo banner and no page errors.
  - It first failed because `getByRole("alert")` matched Next's route announcer after the old code navigated to /log ("HourProof: Your hours"). That was a real red. The locator now filters on the message text.
- **Screenshots:** `home-demo-storage-blocked-viewport-{en,es}-light.png`. The red alert shows under "Probar la demostración", on the home page.

### M6: `today` frozen on /log
- **HourLog change (`HourLog.tsx:32-97`):**
  - `openedOn` (the mount-time date) drives only the load effect and the demo's start-month choice, so the store isn't reopened on every refresh.
  - `today` is state, recomputed on `visibilitychange` (when not hidden) and on window `focus`.
  - When the current month changes and the log is showing the old current month, it follows to the new one. A past month the person chose to view stays put.
- **EntryForm change (`EntryForm.tsx:65-66`):** `date = pickedDate ?? today`, so a new entry's default date follows `today` until the person picks a date. `max={today}` already followed the prop. Edits keep their own date.
- **Test:** `e2e/log.spec.ts:268`.
  - It uses `page.clock.setFixedTime`: 2026-09-30 23:55 PT, then 2026-10-01 00:05 PT, then dispatches `visibilitychange`.
  - The month becomes "October 2026" and Next is disabled.
  - The form date's value and max are 2026-10-01.
  - With the form open, setting the clock to 2026-10-02 and dispatching `focus` moves max and value to 2026-10-02.
  - Red against the old HourLog/EntryForm ("October 2026" not found); green with the fix.

### M7: explicit hedge list
- **Change:** `src/lib/i18n/__tests__/exempt-wording.test.ts:8-37`.
  - `HEDGE_PHRASES` is an ordered list. Negations come first: `not (an) exempt(ion/s)`, `no longer`, `not automatically`, `no es/son (una) exenci`, `no es/está/están exent`, `ya no`, `no automáticamente`.
  - Conditionals come after: `may`, `might`, `possibly`, `if the rule applies`, `es posible`, `posiblemente`, `puede`, `si la regla`.
  - A bare `not` / `no ` no longer counts.
  - `MENTIONS_EXEMPT` now also catches `exenci` (exención/exenciones). The old `/exempt|exent/` missed the Spanish noun, so 4 Spanish rule strings were never checked.
- **New tests:**
  - 9 unconditional claims must fail: "You are exempt.", "You're exempt from the work rule.", "You are likely exempt.", "You are exempt. No proof needed.", "You are exempt, not subject to the rule.", "Usted está exento/a.", "Usted está exenta de la regla.", "Es probable que usted esté exento/a.", "Tiene una exención. No necesita prueba."
  - The gated `result.likely_exempt.*` copy must fail too.
- **Why each current string passes** (first matching phrase):

| String | Matching phrase |
|---|---|
| possibly_exempt.title en | "may" |
| possibly_exempt.title es | "Es posible" |
| age_scope.hint en | "NOT exempt" |
| age_scope.hint es | "NO están exent" |
| unfit.proofThatHelps en | "not exemptions" |
| unfit.proofThatHelps es | "no son exenci" (the negations-first order makes sure this, not the unrelated "puede", is what matched) |
| veteran hint en | "no longer" |
| veteran hint es | "no es una exenci" |
| veteran checklistNote en | "no longer" |
| veteran checklistNote es | "no es una exenci" |
| meeting_80 en | "NOT an exemption" |
| meeting_80 es | "NO es una exenci" |

- **Evidence:** 27 i18n tests pass.

### M8: `californiaDate` via `formatToParts`
- **Change:** `src/lib/dates.ts:9-29`.
  - Uses `en-US` `formatToParts`, takes the year, month and day parts, pads them and validates the shape.
  - Falls back to `toISOString` if the zone isn't supported.
- **Tests:** `src/lib/dates.test.ts:15-38`.
  - Overrides the `Intl.DateTimeFormat.prototype.format` getter to return "26/09/2026" and expects `2026-09-26`. Red against the old code: `expected '26/09/2026' to be '2026-09-26'`.
  - Single-digit padding.
  - 2026-01-01T07:59Z becomes 2025-12-31.
- **Existing tests:** still green. `e2e/log.spec.ts` imports `californiaDate` too.

### M9: upgrade guard
- **Change:** `src/lib/hours/store.ts:64-78`. `export function upgradeSchema(db, oldVersion)` creates the store and index only `if (oldVersion < 1)`. `openDB`'s `upgrade(db, oldVersion)` calls it.
- **Test:** `store.test.ts:325`. With a fake db, `oldVersion` 0 creates the store and the `date` index; `oldVersion` 1 creates nothing. Red (not a function) before the change.

### M10: a rejected open stays cached
- **Change:** `store.ts:~96-107`. `openConnection(name).catch(err => { if (cache.get(name) === connection) cache.delete(name); throw err })`.
- **Test:** `store.test.ts:346`, a real forced failure.
  - Raw-open `hourproof` at version 2, so `openStore('real')` fails with a VersionError.
  - Delete the database, then call `openStore('real')` again. It must now work (put, then list returns 1).
  - Red before the change: the second call got the cached VersionError.

### M11: 200% zoom (180px)
- **Change:**
  - `Checklist.tsx:122-123`: label span `min-w-0 wrap-anywhere`.
  - `Checklist.tsx:128,146`: disclosure indent drops to `pl-4` under 260px, and its body gets `wrap-anywhere`.
  - `HourLog.tsx:192,201`: the nav is `flex-wrap`, and under 260px the month name becomes `order-first basis-full`, a row above the arrows.
  - `Ring.tsx:47,54-56,74`: `maxWidth:100%`, `aspect-square`, the SVG at 100%, smaller inner padding and number under 260px.
  - `src/app/page.tsx:23`: the language buttons `flex-wrap`. The probe found / at 261px otherwise.
- **Test:** `e2e/zoom.spec.ts:16`. At 180×370, en and es, it checks `scrollWidth <= clientWidth` on:
  - `/`
  - the checklist with every "More about this" open
  - `/log` with the disclosure open
  - `/log` on the previous month
- **Evidence:**
  - Before, the probe measured: / 261, checklist 204 (en) and 215 (es), /log 238 (en) and 243 (es).
  - After, every page is 180.
- **Screenshots:** `zoom180-log-{en,es}-light.png`, `zoom180-checklist-{en,es}-light.png` (full page) and `zoom180-checklist-viewport-es-light.png`. The month name sits on its own row, the ring shrinks, and labels wrap (with mid-word breaks such as "embara/zada").

---

## Final verification (real outputs)

| Command | Exit | Result |
|---|---|---|
| `npm test` | 0 | Test Files 14 passed (14); Tests 327 passed (327) |
| `npm run typecheck` | 0 | `tsc --noEmit`, clean |
| `npm run build` | 0 | "✓ Compiled successfully"; routes `/`, `/log`, `/screener` (ƒ), manifest (○) |
| `npm run e2e` | 0 | 49 passed (10.9s) |
| `npm run build && npm run measure` | 0 | "RESULT: all measured routes are within the 200 KB JS budget." |

JS on first load (gate baseline from `docs/plans/phase2-gate.md` → now):

| Route | JS KB (gate) | JS KB (now) | Document KB | Total KB |
|---|---|---|---|---|
| `/` | 154.3 | 154.5 | 8.3 | 349.8 |
| `/screener` | 152.2 | 152.6 | 14.1 | 352.3 |
| `/log` | 156.4 | 157.0 | 8.5 | 351.0 |

No new dependencies. No `npm i` was run.

## Screenshots (all looked at with Read)

All are in `docs/screenshots/phase2/`, at 360×740 and 2x unless marked 180px.

| File | What I checked |
|---|---|
| `checklist-tabfocus-viewport-en-light.png`, `-es-light.png` | The focus ring on a mid-list checkbox after 13 Tabs is fully above the sticky bar; the bar still shows both buttons |
| `log-behind-en-{light,dark}.png`, `log-behind-es-{light,dark}.png` (full page); `log-behind-viewport-*` (4) | The new "To reach 80 this month" / "Para llegar a 80 este mes" pace line; the offline line under Add hours; token colors in dark |
| `log-behind-rule-open-viewport-*` (4) | The disclosure shows "If the rule applies to you, you need 80…" / "Si la regla le aplica, necesita 80…" and the 10-day line with "on average (80 a month)" / "en promedio (80 al mes)" |
| `log-jobsearch-no-program-{en,es}-light.png` | The new note, and "Doesn't count" / "No cuenta" on the in-program job-search row, with no "May count partly" |
| `home-demo-storage-blocked-viewport-{en,es}-light.png` | The inline red alert under the demo button, on the home page |
| `zoom180-log-{en,es}-light.png`, `zoom180-checklist-{en,es}-light.png`, `zoom180-checklist-viewport-es-light.png` (180px) | No sideways overflow; the month name wraps above the arrows; the ring fits |

## Concerns
1. **At 200% zoom the checklist's sticky bar covers about half the screen.** At 180×370 the two stacked, wrapped buttons take about 175 of 370px (see `zoom180-checklist-viewport-es-light.png`). The scroll padding follows, so focus is never hidden, but only about 190px of list shows at a time. This is outside M11's ruling (horizontal scroll). A possible Phase 3 fix is to make the bar non-sticky, or put the buttons side by side, when the viewport is short.
2. **`wrap-anywhere` breaks words mid-word at 180px** (for example "embara/zada"). That is what the ruling asked for, and it beats sideways scrolling, but it reads badly.
3. **Old browsers:** `:has()` needs Chrome 105+ or Safari 15.4+. On older browsers the scroll padding doesn't apply, so I1 is unfixed there. Setting `scroll-padding-bottom` straight from the hook would cover them. Say if you want that.
4. **"about {perDay} a day" drops "hours"**, as the I2 ruling wrote it word for word ("about 18 a day"). The number is clear from context, but it is a little terser than before.
5. **The new and changed Spanish strings are AI translations.** The 7 keys are listed in the new `docs/AI-USE.md` row, marked as needing native and caseworker review.
6. **The M5 alert uses `text-danger`.** It is a token color, but a reviewer may prefer `text-pace` for a non-error explanation.
