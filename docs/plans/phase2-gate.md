# Phase 2 Gate Report — Short Screener, Hour Log, Whole-Loop Demo

Date: 2026-09-26. Branch `phase-2`, HEAD before this task's commit: `9eb3057`.

This is the Task 8 gate: the last task of Phase 2 (`docs/plans/2026-09-26-phase2-short-screener-hour-log.md`). It closes the loop on the home page (check → track → demo), adds the whole-loop e2e test, confirms the JS budget, and records what changed since Phase 1 plus what's still open.

## 1. Real command output

### `npm test`

```
> test
> vitest run

 RUN  v5.0.2 /Users/coolio_999/Desktop/Active/hourproof

 Test Files  14 passed (14)
      Tests  302 passed (302)
   Start at  19:46:03
   Duration  308ms
```
Exit code: `0`.

### `npm run typecheck`

```
> typecheck
> tsc --noEmit
```
No output, exit code: `0`.

### `npm run build`

```
> prebuild
> vitest run src/lib/rules

 Test Files  3 passed (3)
      Tests  163 passed (163)

> build
> next build

▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 833ms
  Running TypeScript ...
  Finished TypeScript in 290ms ...
  Generating static pages using 7 workers (6/6) in 295ms

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /log
├ ○ /manifest.webmanifest
└ ƒ /screener
```
Exit code: `0`.

### `npm run e2e`

```
> e2e
> playwright test

Running 43 tests using 6 workers
...
  43 passed (7.8s)
```
Exit code: `0`. This includes the 9 `e2e/log.spec.ts` cases, 34 `e2e/screener.spec.ts` cases, and the new `e2e/loop.spec.ts` whole-loop case (the count moved from 42 to 43 with this task).

### `npm run measure`

```
Page weight check (base: http://localhost:7050, JS budget: 200 KB/route)
...
RESULT: all measured routes are within the 200 KB JS budget.
```

| Route | JS KB | Document KB | Total KB |
|---|---|---|---|
| `/` | 154.3 | 8.2 | 349.4 |
| `/screener` | 152.2 | 14.0 | 351.7 |
| `/log` | 156.4 | 8.3 | 350.2 |

All three routes are well under the 200 KB JS budget (the largest, `/log`, has ~44 KB of headroom). The bulk of "Total KB" is two woff2 font files (83.6 + 47.6 + 26.9 + 21.5 KB ≈ 180 KB) shared across every route via the browser cache, not per-route JS.

## 2. What Task 8 changed

- `src/app/page.tsx`: after the language choice, three actions in order — **"Check if the rule applies to you"** (`strong` variant, primary), **"Track my hours"** (`primary` variant, → `/log`), **"Try the demo"** (`ghost` variant, tertiary). The existing no-JS `<form>` language switch and the `DemoBanner` (already wired via `Screen`'s `banner` slot) are unchanged.
- `src/components/ui/TryDemoButton.tsx` (new): a client component. It renders nothing but a `<noscript>` explanation until a `useEffect` (client-only, fires after mount) flips it to the real button — this is what keeps `startDemo`/IndexedDB out of the server render and out of the no-JS path entirely, per the task's constraint. On click: `startDemo(californiaDate())` then `router.push('/log')`.
- `messages/en.json` / `messages/es.json`: added `home.trackHours`, `home.tryDemo`, `home.demoNeedsJs` in both languages (parity test covers this). The Spanish strings are AI-drafted and are logged in `docs/AI-USE.md` as needing native review, per the standing Phase 2 rule.
- `e2e/loop.spec.ts` (new): one Playwright test (not two `test()`s) covering both the brief's case 1 (home → check → subject path → track → add 8 hours → "8 of 80") and case 2 (home → try the demo → banner + seeded ring + behind status + per-day pace line → exit demo → `/log` shows the real 8-hour entry, not demo data) in a single Page/IndexedDB, so the demo-isolation claim is actually exercised end-to-end, not just asserted by two independent runs that happen to look consistent.
- `docs/AI-USE.md`: new row for this task's files.
- Screenshots captured into `docs/screenshots/phase2/`: `home-en-light.png`, `home-en-dark.png`, `home-es-light.png`, `home-es-dark.png`, `log-demo-from-home-en-light.png`.

No changes were needed to `scripts/measure-js.mjs` — `/`, `/screener` and `/log` were already in its `ROUTES` list from Task 7.

## 3. Screenshots

In `docs/screenshots/phase2/` (55 files total across all of Phase 2; this task added 5):

- `home-en-light.png`, `home-en-dark.png` — home page, English, both themes. Three buttons stack cleanly at 360px; "Check if the rule applies to you" reads as the one strong action, "Track my hours" as a clear second choice, "Try the demo" as a quiet text link.
- `home-es-light.png`, `home-es-dark.png` — home page, Spanish, both themes. "Anote mis horas" and "Probar la demostración" fit on one line at 360px without wrapping.
- `log-demo-from-home-en-light.png` — the result of clicking "Try the demo" from the home page: the `Demo — sample data, not yours.` banner at the top, the ring at 66 of 80 hours (September 2026's seeded, deliberately-behind total), and the pace line "You need 14 more hours in 4 days — about 3.5 hours a day." All three were looked at directly (not just asserted in e2e) to confirm legibility and that the banner doesn't cover the "EN/ES" and theme controls beneath it.

The Task 4 and Task 7 screenshot sets (checklist, results, log states) already exist from their own gates and are unchanged by this task.

## 4. What changed since Phase 1

**Screens answered on the subject path:** Phase 1 was reported at about 17 "No"s before landing on "call your county" with nothing to do. After Phase 2, the shipped rule file (`rules/ca-calfresh-2026.json`, as of 2026-09-26, with the waiver-county scope rule still active) produces exactly **5 screens** on the subject path — confirmed by calling `screens()` directly against the real rule set (`age_scope`, `waived_county_scope`, `checklist`, `unfit_indicators_ask_county`, `meeting_80_hours`) and by both `e2e/screener.spec.ts` test 1 (`screens <= 5`) and `e2e/loop.spec.ts`, which both walk the real UI end to end. That's a drop from ~17 to 5.

**Beyond the screen count:**
- The 13 exemption questions collapsed into one checklist screen instead of 13 separate ones.
- Every result now carries a concrete next step: what to tell the county (`countyScript()`, built from the checked items' short labels), what proof to bring, a one-tap call, a print-friendly summary, and — for anyone the rule applies to or who is meeting it — "Start tracking my hours" into the new hour log.
- The hour log itself (Task 5–7) didn't exist in Phase 1: it's a local-first, IndexedDB-backed 80-hour tracker with a ring, a pace line, and CalFresh's actual counting rules (job search only inside a program, workfare never combined, quarter-hour precision).
- "Try the demo" (this task) makes the whole loop demonstrable with one click from the home page, seeded with a deterministic, isolated dataset that never touches the real log.

## 5. Open items for Phase 3

- **ShiftCred QR check-in** — not started. Phase 2 has no proof-capture mechanism beyond the manual entry form; ShiftCred is meant to let an employer/program confirm hours at the point of work.
- **Supabase anonymous auth** — not started. Phase 2 is deliberately local-only (no server, no Supabase, no service worker — see the plan's Global Constraints); this arrives with ShiftCred so hours can sync across devices without collecting identity.

## 6. Open items for the human track

| By | Task | Why |
|---|---|---|
| Sep 28 | Register on congressionalappchallenge.us (parent contact, 9-digit ZIPs, the quiz) | Unlocks the application |
| Sep 29 | Send the caseworker/legal-aid review ask, with `rules/ca-calfresh-2026.json` **and the checklist labels** | The only path to "likely exempt" wording (the safety gate requires `reviewedAt` + a `confirmed` rule; nothing is reviewed yet) |
| Sep 29 | Email kitchens + Second Harvest (Claude can draft) | Pilot + what SCC accepts as volunteer proof |
| Oct 3 | Pilot go/no-go | |
| Oct 10 | Native Spanish review of `messages/es.json` and the rule/label Spanish, **including this task's three new strings** (`trackHours`, `tryDemo`, `demoNeedsJs`) | P0 — every AI-drafted Spanish string in this phase is unreviewed |
| Anytime | Confirm (408) 758-3800 on the county's CalFresh page | The number on every result |

## 7. Deferred minor items (from `progress.md`, verbatim)

These were logged during Phase 2 as accepted, low-cost deferrals — not blockers for this gate, carried here for visibility:

- Task 1: package.json devDeps order; `storageFor` typed non-nullable; `californiaDate` re-export now optional.
- Task 3: `checklistAnswers` accepts non-empty `checkedIds` with mode `none`; temp adapter progress count frozen during checklist (Task 4 replaced it).
- Task 5: `summarizeMonth` trusts its input (silently rounds non-quarter hours; `validateEntry` is the actual gate, and it does reject them).
- Task 6: a rejected `openDB` promise stays cached in `dbConnections` (needs a `.catch` to delete the cache entry); `blocking()`/`terminated()` handlers are untested.
- Task 7: "May count partly" also shows when program hours = 0 (where job search actually counts 0) — the wording is hedged enough not to be wrong, but it's imprecise.

Controller rulings made along the way (verbatim, for the record — none of these are new in Task 8):
- Exemption labels for ORR/tribal/health rewritten for clarity; label cap raised 48→56 chars.
- Task 5 (pure hours engine) was run in a parallel worktree alongside Task 4, deviating from the plan's strict sequential rule, because the two tasks share no files — accepted, no conflicts materialized beyond a `docs/AI-USE.md` merge.
- Screener checklist draft answers persist across a language switch (`hp.screener.v2.draft`).
- `countyScript()` keeps "I'm" capitalized mid-sentence (cosmetic, accepted).
- Ring track color uses the `border` token; demo counted total is `clamp(80 − 3.5×daysLeft, 10, 76)` so the demo is behind but achievable (~3–4 hours/day); the previous month is seeded as fully met when the demo opens on days 1–3 of a new month.
- `behind_pace` was removed as a triggered alert note in favor of a neutral, collapsed "How the rule works" disclosure holding the 10-day reporting fact, so the log never claims to know a user's actual weekly hours from monthly totals alone.

## 8. Verdict

All required commands ran with real, pasted output above, all pass, and all three measured routes are within budget. The whole-loop e2e (`e2e/loop.spec.ts`) is new and passing, proving in one browser context that a real hour entry survives a full demo excursion. Phase 2 is gate-complete on the engineering side; the human track above is what stands between this build and anything going in front of a real CalFresh recipient or the Congressional App Challenge submission.
