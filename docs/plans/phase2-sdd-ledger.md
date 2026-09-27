# SDD ledger — plan: docs/plans/2026-09-26-phase2-short-screener-hour-log.md
Spec: docs/PRD-snapshot-2026-09-25.md + docs/research/calfresh-rules-verification.md (research wins) + master plan; user feedback 2026-09-26 ("long survey that tells you to call your county")
Branch: phase-2 from main 8174832

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T3 | T1 moves californiaDate to src/lib/dates.ts (re-exported from engine); T3 rewrites engine | OK if T3 keeps re-export or imports from dates |
| T1 ↔ T4 | safeGet/safeSet; T4 storage key hp.screener.v2 | OK |
| T1 ↔ T8 | T1 refactors page.tsx storage/cookie; T8 adds home actions | OK sequential |
| T2 ↔ T3 | label_en/label_es, schema coupling; T3 fixture uses label fields + unclear exemption | OK; T3 fixture exemption rules must satisfy T2's coupling (they do) |
| T3 ↔ T4 | Step v2 / countyScript / checklistAnswers / ruleText.label | T3 breaks Phase 1 UI types → Ruling 2 |
| T5 ↔ T6 | validateEntry, Entry, EntryError | OK |
| T5/T6 ↔ T7 | summarizeMonth, openStore, getMode, exitDemo | OK |
| T6 ↔ T8 | startDemo | OK |
| T1/T7/T8 | measure-js routes, package.json scripts | OK sequential |
| T1 self | themeColor "both media + toggle updates meta" is ambiguous with two meta tags; app ignores system scheme | Ruling 3 |
| T2 self | labels must not contain exempt/exento; ≤48 chars | consistent |
| T3 self | tests vs code sketch — traced goBack/nextStep cases by hand | consistent |
| T4 self | e2e case 8 wording ambiguous | Ruling 4 |
| T5 self | tests vs rules (quarter-hour ints, cap = program − 0.25) | consistent |
| T6 self | fake-indexeddb per test file; store imported only by client comps | consistent |
| T7 self | ?add=1 / ?edit= views inside /log | consistent |
| T8 self | loop e2e relies on same browser context for real entries | consistent |

Ruling 1: tasks run sequentially T1→T8 (SDD rule) — costs wall-clock only.
Ruling 2: T3 may add a minimal temporary adapter in Screener/Result so typecheck+build stay green; T4 removes it — costs nothing if wrong.
Ruling 3: theme-color = single <meta name="theme-color"> set from the viewport export to light bg; boot script and ThemeToggle set its content to the dark bg when dark is active (no prefers-color-scheme media variants, since the app ignores system scheme) — costs a status-bar color mismatch if wrong.
Ruling 4: T4 e2e case 8 = reload while on the checklist screen keeps the user on the checklist (position persists); checked-but-unsubmitted boxes need not persist; boxes re-check after Back from a checklist result (case 4) — costs nothing if wrong.
Task 1: implementer DONE (59e5395); setLocaleCookie unused yet
Task 1: complete (commits 8174832..59e5395, review clean)
Task 1: minor (deferred): package.json devDeps order; storageFor typed non-nullable; californiaDate re-export now optional now
Task 2: implementer DONE (7b0987b); flagged labels: health_limits_20h, tribal_ihcia, orr acronym
Task 2: review ❌ (4 Important: ORR jargon; tribal label drops descendants; health label "can't" vs "hard"; bare toThrow in new tests)
Ruling: labels → "I'm in ORR refugee training at least half-time" / "I'm American Indian or Alaska Native, or a descendant" / "A health problem makes it hard to work 20 hours a week"; label cap 48→56 chars — costs slightly longer checkbox rows if wrong.
Task 2: fix round 1 dispatched (FIX_BASE 7b0987b)
Task 2: fix round 1/5 (4 addressed, 0 open; commits 7b0987b..1edf9b6)
Task 2: complete (commits 59e5395..1edf9b6, review clean)
Task 3: implementer interrupted by controller session end; partial uncommitted engine.ts/engine.test.ts; resumed same agent (BASE 1edf9b6)
Task 3: implementer DONE (5ac0293); 2 e2e fixme (restored in T4); temp sequential adapter in Screener.tsx
Ruling: accept implementer fix adding age:"no" to plan test "checked items give likely_exempt" — plan defect (without it nextStep stops at the age question) — costs nothing if wrong.
Task 3: review ❌ (2 Important, plan-mandated: ruleText tests deleted; validUntil goBack/stale tests dropped)
Ruling: restore both suites against v2 fixture + labelFallback cases + displayOutcome pass-through + unsure-on-scope — plan Step 1 fixture was the defect — costs nothing if wrong.
Task 3: minor (deferred): checklistAnswers accepts non-empty checkedIds with mode none; temp adapter progress count frozen during checklist (T4 replaces)
Task 3: fix round 1 dispatched (FIX_BASE 5ac0293)
Task 3: fix round 1/5 (2 addressed, 0 open; commits 5ac0293..99888d7)
Task 3: complete (commits 1edf9b6..99888d7, review clean)
Ruling: user asked why slow (2026-09-26 18:47); Task 5 (pure hours engine, only src/lib/hours/*) runs in parallel with Task 4 in worktree ../hourproof-hours on branch phase-2-hours from 99888d7, merged back after review — deviates from SDD sequential rule; no shared files — costs a merge conflict in docs/AI-USE.md at worst.
Task 5: implementer DONE (642a0d2 in worktree phase-2-hours); 256/256
Task 5: review ❌ (1 Important: workfare_mixed misses workfare + in-program job search with no program hours)
Task 5: minor (deferred): summarizeMonth trusts input (silent rounding of non-quarter hours; validateEntry is the gate)
Task 5: fix round 1 dispatched (FIX_BASE 642a0d2, worktree)
Ruling: Task 5 fix round re-review done by controller reading the 3-line diff + rerunning src/lib/hours tests (17/17) instead of a re-review agent — user asked for speed — costs a missed subtlety in a 3-line diff if wrong.
Task 5: fix round 1/5 (1 addressed, 0 open; commits 642a0d2..625d07c)
Task 5: complete (commits 99888d7..625d07c on phase-2-hours, review clean)
Task 4: implementer DONE (ce0476c); 244 unit, 32 e2e, /screener 151.9KB
Task 4: controller screenshot findings: (a) "More" disclosure beside labels squeezes rows to 3 lines; (b) veteran note says "go back and answer yes to the disability question" but it is on the same checklist
Ruling: accept draft checkbox persistence (hp.screener.v2.draft) — survives language switch — costs nothing if wrong.
Ruling: accept proof note under "Why" for meeting_requirement/not_subject (guidance, not "what to bring") — costs a paragraph if wrong.
Ruling: leave label capitalization in countyScript ("I'm" must stay capital) — cosmetic.
Task 4: review Approved (Important items = product calls: checklist length; proof-under-Why already ruled)
Ruling: checklist rows full-width with "More" disclosure below label; sticky bottom action bar (Continue (n) | None/Not sure); checklistNote_en/es field for veteran_info pointing at the disability checkbox (hint_en untouched); fieldset/legend for describedby — costs a layout revert if wrong.
Task 4: fix round 1 dispatched (FIX_BASE ce0476c)
Task 6: implementer DONE (1d2b23f worktree); 269/269
Task 6: review ❌ (2 Important: IDB connections never closed → leak/upgrade block; put read+write not atomic). Isolation verified sound.
Ruling: cache one connection per DB name with blocking()/terminated() handlers + test-only closeAll; put in a single readwrite tx with a concurrency test — costs nothing if wrong.
Task 6: fix round 1 dispatched (FIX_BASE 1d2b23f, worktree)
Ruling: Task 6 fix re-review done by controller reading store.ts diff (cache + blocking/terminated + single readwrite tx) — user asked for speed — costs a missed subtlety if wrong.
Task 6: minor (deferred): a rejected openDB promise stays cached in dbConnections (add .catch → delete); blocking()/terminated() untested
Task 6: fix round 1/5 (2 addressed, 0 open; commits 1d2b23f..c71cfbd)
Task 6: complete (commits 625d07c..c71cfbd on phase-2-hours, review clean)
Pending: merge phase-2-hours into phase-2 after Task 4 fix round lands.
Ruling: Task 4 fix round verified by controller viewing the sticky-bar screenshot + implementer evidence (e2e 33/33) — reviewer had already approved T4 — costs a missed layout nit if wrong.
Task 4: fix round 1/5 (4 addressed; commits ce0476c..cad4001)
Task 4: complete (commits 99888d7..cad4001, review clean)
Merged phase-2-hours into phase-2 (f3b58c4): npm test 288/288 exit 0, typecheck 0. Worktree removed.
Task 7: implementer DONE (1d22c3a); 298 unit, 41 e2e, /log 155.7KB
Ruling: send controller rulings as fix round 1 BEFORE the task review, then review final state once (base 7b..head) — user asked for speed — costs one less independent pass on the first draft.
Ruling: ring track uses border token; demo counted = clamp(80-3.5*daysLeft,10,76) (behind but ~3-4h/day); form order Date→Hours→Kind + sticky Save; page-language formatted date under native input; behind_pace note reworded + shown only when daysElapsed≥7 — costs copy/layout tweaks if wrong.
Task 7: fix round 1 dispatched (FIX_BASE 1d22c3a)
Task 7: fix round 1 done (87df673); 303 unit, 41 e2e; demo 66/80 ~3.5h/day on 09-26
Ruling (pending, add to review fixes): previous-month demo seed (days 1-3) must be met (>=80), not 76 behind.
Task 7: review Approved (2 Important: behind_pace note trigger/wording still overreaches; capped job search has no per-row tag)
Ruling: remove behind_pace as a triggered note; add neutral "How the rule works" disclosure with the 10-day fact; per-row "May count partly" tag when job_search_capped; demo previous month seeded as met — costs a missed nudge for someone genuinely below 20h/wk if wrong.
Task 7: fix round 2 dispatched (FIX_BASE 87df673)
Task 7: fix round 2/5 (addressed; commits 87df673..9eb3057; 302 unit, 42 e2e)
Task 7: minor (deferred): "May count partly" also shows when program hours = 0 (counts 0) — hedged wording
Task 7: complete (commits f3b58c4..9eb3057, review approved)
Ruling: Task 8 skips per-task review (plumbing: home buttons, loop e2e, gate doc) — covered by the final whole-branch review; controller viewed home screenshot — costs one review layer if wrong.
Task 8: complete (commits 9eb3057..e8d9db6; 302 unit, 43 e2e, JS / 154.3 /screener 152.2 /log 156.4)
FINAL REVIEW (opus): With fixes — Important: checklist sticky bar hides focus (WCAG 2.4.11); /log "you need 80" overreach; README stale. Nothing critical; safety gate, demo isolation, privacy, offline durability verified directly.
Ruling: one fix wave = I1-I3 + M1-M11 (final-fix-findings.md); Phase 3 items (entry shape, merge layer, sync/demo guard, deletion markers, rounding) go to the Phase 3 plan — costs a second pass if wrong.
Note: killed stray next-server pid 89619 on :7051 (started 19:48 by our Task 8 run).
Final fix wave: DONE (e8d9db6..b514808, 11 commits); 327 unit, 49 e2e; JS 154.5/152.6/157.0
Final fix wave re-review: all findings addressed. Controller verify: npm test 327/327 exit 0, typecheck 0, build 0, e2e 49/49 exit 0, ports clean.
Phase 2 → Phase 3 plan inputs: Entry source/verified shape, merge layer for server shifts, sync never writes demo DB, deletion markers, QR time rounding rule, blocking()/terminated() tests, checklistAnswers mode-none guard, TryDemoButton blanket catch, single global --sticky-bar-h.
