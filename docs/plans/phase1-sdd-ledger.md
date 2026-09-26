# SDD ledger — plan: docs/plans/2026-09-25-phase1-foundation-screener.md
Spec: docs/PRD-snapshot-2026-09-25.md + docs/research/calfresh-rules-verification.md (research wins) + docs/plans/2026-09-25-master-plan.md
Branch: phase-1 (from main d3d8a62)

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T4 | T1 creates layout.tsx, globals.css; T4 rewrites both | OK sequential |
| T1 ↔ T5 | T1 next.config.ts, layout.tsx; T5 wraps with next-intl plugin + provider | OK sequential |
| T2 ↔ T3 | T2 Rule/RuleSet/parseRuleSet + real-file.test.ts; T3 imports them, appends to real-file.test.ts | OK; names match |
| T3 ↔ T6 | nextStep/goBack/displayOutcome/ruleText signatures | match |
| T5 ↔ T6 | messages keys (result.notDecision etc.) | T6 must use T5 keys; e2e strings "you're meeting it", "You may be exempt" present in T5 copy ✓; possibly_exempt copy contains no "likely exempt" ✓ |
| T4 ↔ T6 | tokens/Tailwind classes, ThemeToggle | OK |
| T6 ↔ T7 | layout.tsx manifest link | OK sequential |
| T1 self | scripts, postinstall shim, build check | consistent |
| T2 self | tests vs schema code | consistent; county.phone must be web-sourced |
| T3 self | test literals like {type:'result',outcome:'subject'} widen to string under tsc | see Ruling 2 |
| T4 self | contrast test may fail PRD light tokens | plan says adjust token, not threshold — OK |
| T5 self | next-intl no-routing API may differ in current major | plan says read docs — OK |
| T6 self | e2e webServer builds then starts on 7050 | OK |
| T7 self | deploy is outward-facing | stop and ask user before deploy |
| Plan "Parallelism" section | says run T2/T4/T5 in parallel | conflicts with SDD "never parallel implementers" → Ruling 1 |

Ruling 1: run all tasks sequentially (T1→T7), not in parallel worktrees — SDD forbids parallel implementers and T4/T5 both edit layout.tsx — costs ~1 extra hour wall-clock if wrong.
Ruling 2: implementers may add `as const` to test object literals so `npm run typecheck` passes; assertions unchanged — costs nothing if wrong.
Ruling 3: T7 deploy step stops for user approval (outward-facing publish) — the rest of T7 (manifest, budget) proceeds.
Task 1: implementer DONE_WITH_CONCERNS (8c0abfa); concerns: postinstall not firing on 'npm i <pkg>' (npm only runs root lifecycle on bare install — expected), Turbopack warning from ~/package-lock.json (env, out of scope), Next-generated CLAUDE.md/AGENTS.md committed.
Ruling: keep Next-generated CLAUDE.md/AGENTS.md committed — next dev re-creates them anyway and they warn agents about Next 16 API changes — costs a 2-file revert if wrong.
Task 1: review ❌ (2 Important: shim unproven on clean install; AI-USE missing CLAUDE.md/AGENTS.md)
Task 1: minor (deferred): vitest ESM-as-CJS warning — add "type":"module" to package.json
Task 1: minor (deferred): Turbopack warns about stray ~/package-lock.json (env, outside repo)
Task 1: fix round 1 dispatched (FIX_BASE 8c0abfa)
Task 1: fix round 1/5 (2 addressed, 0 open; commits 8c0abfa..0626034)
Task 1: complete (commits d3d8a62..0626034, review clean)
Task 2: implementer DONE (a281e19). County phone (408) 758-3800 from sccgov IHSS contacts PDF (CalFresh pages 403). Build-fails-on-bad-JSON only once UI imports load.ts (Task 6) — tests fail loudly now.
Ruling: accept the multi-program sccgov PDF as the phone source; user to eyeball the dedicated CalFresh page in a browser before the pilot — costs a wrong number on the result screen if the PDF is stale.
Task 2: review ❌ (1 Important: build does not fail on malformed rules — load.ts not imported by app yet)
Ruling: fix via "prebuild": "vitest run src/lib/rules" instead of a UI import — build-fail guarantee independent of imports; Task 6 still owns pages — costs ~2s per build if wrong.
Task 2: minor (deferred): z.string().url() deprecated in zod 4 (use z.url())
Task 2: minor (deferred): next-env.d.ts churn not noted in AI-USE
Task 2: fix round 1 dispatched (FIX_BASE a281e19)
Task 2: fix round 1/5 (1 addressed, 0 open; commits a281e19..fbf55b3)
Task 2: complete (commits 0626034..fbf55b3, review clean)
Task 3: implementer DONE (57a105a); fixed plan bug in ruleText fallback (now !q only)
Task 3: review ❌ (1 Important: ruleText !q-only fallback hides English proof substitution — Review Focus 3)
Ruling: ruleText returns {question, proof, questionFallback, proofFallback}; brief test fixture was the bug (age lacked proofThatHelps_es) — tests amended, not weakened; Task 6 must render the tag per field — costs a small UI change if wrong.
Task 3: minor (deferred): goBack relies on rules.min(1) invariant for last-index fallback — add a comment
Task 3: fix round 1 dispatched (FIX_BASE 57a105a)
Task 3: fix round 1/5 (1 addressed, 0 open; commits 57a105a..09fa6b3)
Task 3: complete (commits fbf55b3..09fa6b3, review clean)
Task 4: implementer DONE (f9eb228); no token changes; concerns: font vars not mapped to utilities, emoji in toggle, no DOM test
Task 4: review ❌ (3 Important: fonts never applied; tokens.ts/globals.css hex duplication untested; emoji toggle icons)
Ruling: fonts via @theme --font-sans/--font-display + body/h1-h3 rules; css-sync test asserts globals.css hex == tokens.ts; SVG icons + action-phrased aria-label (folds minor #4 since same element) — costs a small revert if wrong.
Task 4: minor (deferred): ThemeToggle initial state "light" before effect → possible one-frame icon flash
Task 4: minor (deferred): vitest ESM/CJS config warning (same as Task 1 deferred)
Task 4: fix round 1 dispatched (FIX_BASE f9eb228)
Task 4: fix round 1/5 (3 addressed, 0 open; commits f9eb228..0326949)
Task 4: complete (commits 09fa6b3..0326949, review clean)
Ruling: result copy drops the {reason} placeholder (rules have no short label; interpolating the question reads badly) — heading "You may be exempt. Ask your county to confirm." + separate key result.becauseYes "You answered yes to: {question}" — costs a copy tweak if wrong.
Task 5: implementer DONE (1d7dda2); / now dynamic (cookie locale) — expected
Task 5: complete (commits 0326949..1d7dda2, review clean)
Task 5: minor (deferred): es.json uses generic masculine "exento"/"seguro" — reword gender-neutral during native Spanish review
Task 5: minor (deferred): next-env.d.ts churn
Task 6: implementer DONE (cf71f5f); fixed unsure→'You answered yes' bug; Source link English-only
Task 6: review ❌ (3 Important: proof dropped on unsure path; Source link English; no blocked-storage test) + controller: call link <48px
Ruling: Result gets rule + answer; becauseYes vs new becauseUnsure key; proof shown for both — costs a copy tweak if wrong.
Ruling: blocked-storage coverage via e2e addInitScript (no jsdom in repo) — costs nothing if wrong.
Ruling: call-county link becomes 48px full-width tap target with tel:+1<digits> (folds reviewer minor on tel normalization, same element) — costs a style revert if wrong.
Task 6: fix round 1 dispatched (FIX_BASE cf71f5f)
Task 6: fix round 1/5 (4 addressed, 0 open; commits cf71f5f..76a07df)
Task 6: minor (deferred): Result becauseYes/becauseUnsure ternary relies on engine invariant (only yes/unsure attach ruleId) — exhaustive switch later
Task 6: complete (commits 1d7dda2..76a07df, review clean)
Task 7: implementer DONE_WITH_CONCERNS (232fc1a); /screener was 241KB (zod in client) → 147.7KB via server-side ruleSet prop; icon check reads like arrow
Ruling: app icon ships as placeholder (clock ring reads; check reads as arrowhead) — defer to the design/brand pass in Phase 2 human track rather than loop on it — costs one icon swap later.
Task 7: review Approved but 2 Important (rules data moved into RSC payload unmeasured; reuseExistingServer stale-build footgun)
Ruling: measure-js reports document + total bytes per route; playwright reuseExistingServer:false; measure-js owns its server lifecycle — costs slower e2e startup if wrong.
Task 7: minor (deferred): gate report omits duplicate next-env.d.ts note under Task 5
Task 7: fix round 1 dispatched (FIX_BASE 232fc1a)
Task 7: fix round 1/5 (2 addressed, 1 new Important: SIGTERM only to npm not process group; commits 232fc1a..a2462c2)
Task 7: fix round 2 dispatched (FIX_BASE a2462c2)
Task 7: fix round 2/5 (1 addressed, 0 open; commits a2462c2..69c9af8)
Task 7: complete (commits 76a07df..69c9af8, review clean)
FINAL REVIEW (opus): With fixes — Critical: Spanish screener shows English rule texts (no task owned rule translation). Important: proof/hint mixing, waived-county expiry, no-JS blank screener, README wrong product, Source link 32px, no exit/lang switch; I7 locale arch → Phase 2 plan.
Ruling: one fix wave covers C1, I1-I6 and minors M1,M2,M3,M5,M9,M10,M12,M14 (list in final-fix-findings.md); I7, M4, M6, M7, M8, M11, M13, M15 go to Phase 2 plan — costs a second pass on Phase 2 items if wrong.
Ruling: M4 keep PRD behavior (unsure ends screener → ask county) — cautious outcome — costs extra questions if the user prefers continuing.
Ruling: rule-text Spanish is AI-drafted and gated by native+caseworker review in Phase 5 — costs a mistranslation reaching demo viewers if the review slips.
Note: final reviewer wrote observation #195 to ~/skill-observations/log.md (outside repo scope; harmless, left in place).
Final fix wave: DONE_WITH_CONCERNS (69c9af8..6e1dc3f, 6 commits); unit 168/168, e2e 20/20, JS 150.4/149.1KB
Ruling: validUntil compared against America/Los_Angeles calendar date (SSR/CSR agree) — accepted — costs a one-day edge if wrong.
Ruling: accept fixer choices (EN|ES switch hidden on home, no border on text-style buttons, screener text 18px, .nvmrc 24, loop-based e2e counts) — costs small UI tweaks if wrong.
Final fix wave: re-review — all findings addressed (69c9af8..6e1dc3f); controller verified: unit 168/168 exit 0, typecheck 0, build 0, e2e 20/20 exit 0
Final: parked — meeting_80_hours + "Not sure" shows proof "you are meeting it" on ask_county result — Ruling: fix as Phase 2 Task 0 (suppress proof on unsure for info-kind rules, or add proofIfUnsure) — real but not safety-gate; costs one misleading line on a rare path until fixed.
