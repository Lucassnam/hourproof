# Phase 2: Short Screener, Next-Step Results, Hour Log + Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person answers about 4 screens (not 17), gets a result with a concrete next step, and, if the rule applies to them, lands on an 80-hour tracker that saves on their phone. "Try the demo" shows the whole loop with a seeded month.

**Why this phase changed (user feedback, 2026-09-26):** Phase 1 felt like "a long survey that tells you to call your county." The person the app is for (subject to the rule) answered about 17 "No"s and got nothing to do. This phase makes the screener a 30-second opening and the tracker the product.

**Architecture:**
- **Screener v2:** the rules still come from `rules/ca-calfresh-2026.json`, but the engine groups them into **screens**: each `scope` rule is one question, all `exemption` rules become **one checklist screen**, and each remaining `info` rule with a real outcome is one question. `info` rules with `outcomeIfYes: 'continue'` (veterans) become notes shown on the checklist screen instead of questions.
- **Results** gain next steps: what to tell the county (a script built from short, reviewed labels), what proof to bring, one-tap call, a print-friendly summary, and **"Start tracking my hours"** for anyone the rule applies to.
- **Hour log:** local-first, stored on the device in IndexedDB (`idb`). A pure `summarizeMonth` engine applies the verified counting rules (combining activities, workfare, job search). A separate IndexedDB database holds demo data, so demo and real entries never mix.
- **No server, no Supabase, no service worker in this phase.** Supabase (anonymous auth) arrives with ShiftCred in Phase 3.

**Tech Stack:** Next 16, React 19, TypeScript, Tailwind v4, next-intl 4 (cookie locale), zod 4, `idb` (IndexedDB wrapper, ~1 KB), `fake-indexeddb` (tests only), Vitest, Playwright.

**Spec:** `docs/PRD-snapshot-2026-09-25.md` §Hour log, §Functional requirements 1–2, corrected by `docs/research/calfresh-rules-verification.md` (the research wins) and `docs/plans/2026-09-25-master-plan.md`. Phase 1 state: `docs/plans/phase1-gate.md`, `docs/plans/phase1-sdd-ledger.md`.

## Global Constraints (all of Phase 1's still apply)
- The **safety gate** is unchanged in spirit: "likely exempt" / "Es probable que usted esté exento/a" is displayed only when `reviewedAt` is non-null **and** at least one checked exemption rule has `confidence: "confirmed"`. Otherwise it says "You may be exempt. Ask your county to confirm." Every existing safety test is migrated, none deleted.
- Every result shows verbatim: "This is not a decision. Only your county can decide." / "Esto no es una decisión. Solo su condado puede decidir."
- "Working 20+ hours a week" is never an exemption.
- English rule texts (`question_en`, `hint_en`, `proofThatHelps_en`, `sourceQuote`) are not reworded. New short labels are new fields.
- **Hours and notes never leave the device.** No network call carries entry data. The log screen says so: "Your hours are saved only on this phone."
- Demo data lives only in the `hourproof-demo` IndexedDB database and is always labeled with a visible "Demo" banner.
- Body 18px+, tap targets 48px+, colors only from tokens, every storage access guarded, en + es for every string, and plain words (6th-grade level).
- JS budget: first-load JS under 200 KB on `/`, `/screener` and `/log` (measured with `npm run measure`).
- Every AI-written file gets a row in `docs/AI-USE.md`. Spanish drafted by AI is marked "needs native review."
- Dates are **California calendar dates** (`America/Los_Angeles`), using the shared `californiaDate()`.

## Review Focus
1. **The checklist with none checked vs. "I'm not sure":** "None of these apply" must continue to the next question. "I'm not sure" with nothing checked must end at ask-county. "I'm not sure" with some items checked must give the possibly-exempt result for the checked items. (Engine tests, Task 3.)
2. **Back from a result produced by the checklist** must return to the checklist with the previous boxes still checked (the checklist re-opens with the answers), not to question 1. (Engine test for the answers, and e2e, Tasks 3–4.)
3. **The "Not sure" on the 20-hours question** (the Phase 1 leftover) gives the ask-county result with the script "I'm not sure if I meet the work rule…", and **never** shows "you are meeting it". (e2e, Task 4.)
4. **Month boundaries and quarter hours in the tracker:** an entry on the 31st counts in its own month. 0.25-hour steps add up without float drift (79.75 + 0.25 must equal 80 and show "met"). Hours over 24 in a day are rejected. (Hours engine tests, Task 5.)
5. **Demo isolation:** starting the demo, adding an entry, then "Exit demo" leaves the real log exactly as it was, including when the real log was empty. (Store tests with fake-indexeddb, Task 6, and e2e, Task 8.)

---

## Decisions made in this plan (flag any you disagree with)
| Topic | Decision | Why |
|---|---|---|
| Locale architecture (Phase 1 final review, item I7) | Keep the cookie locale. **No service worker in the challenge build.** | Offline *data* comes free from IndexedDB. An offline *app shell* needs a service worker, and the cookie locale makes that hard. Not worth it before Oct 24. Revisit after the challenge. |
| Exemption checklist | One screen, a checkbox per exemption, each with a short label (`label_en/_es`). Buttons: "Continue" (enabled when at least one is checked), "None of these apply", "I'm not sure". | Takes 17 screens down to about 4 |
| Multiple exemptions checked | The result lists every checked exemption with its proof | A person may qualify several ways, and the county needs all of them |
| Veteran rule (`continue`) | Shown as a note on the checklist screen, not a question | It never changed the outcome, so it was a wasted tap |
| County script | Built from the checked items' short labels: "I think I don't have to meet the CalFresh work rule because: I'm pregnant; I care for a child under 6. Can you check my case?" | Gives the user words to say, which is the real barrier |
| Print summary | `window.print()` with a print stylesheet (no PDF library) | The PDF proof packet is Phase 4. This gives something to show a caseworker now, at no bundle cost. |
| Pay-stub photos, good-cause log, SMS | **Not in Phase 2** (photos → Phase 4 with the packet; good cause → Phase 5; SMS dropped) | YAGNI; they don't affect this phase's gate |
| Job search counting | Counts only when marked "part of a job program", and only while it's less than the program's own hours (so less than half the combined total). Otherwise it's logged but not counted, with a plain note. | Research row 7 (SCC handbook: "less than half of the combined total") |
| Workfare | Logged separately. If mixed with other activities in a month, those hours still count, but a note says "Workfare hours are checked differently by your county. Ask them." | Research row 6b: workfare can't be combined, and its required hours depend on the benefit amount, which the app doesn't know |
| IDs | `crypto.randomUUID()` | Built in, no dependency |

---

## File map
```
package.json                      + "measure" script, + devDeps: playwright (explicit), fake-indexeddb; + dep: idb
vitest.config.mts                 (renamed from .ts: silences the ESM/CJS warning)
next.config.ts                    turbopack.root = __dirname (silences the stray ~/package-lock.json warning)
rules/ca-calfresh-2026.json       + label_en/label_es on the 13 exemption rules
src/lib/dates.ts                  californiaDate(), monthOf(), daysInMonth(), (moved out of the engine)
src/lib/storage/safe.ts           safeGet/safeSet/safeRemove (local/session), setLocaleCookie()
src/lib/rules/schema.ts           + label fields, kind↔outcome coupling, reviewer iff reviewedAt, z.url
src/lib/rules/engine.ts           v2: screens(), nextStep(), goBack(), displayOutcome(), ruleText(), countyScript()
src/lib/rules/__tests__/*.test.ts migrated + new
src/lib/hours/types.ts            Entry, ActivityType, MonthSummary, Flag
src/lib/hours/summarize.ts        summarizeMonth(), validateEntry()
src/lib/hours/__tests__/summarize.test.ts
src/lib/hours/store.ts            openStore('real'|'demo'), EntryStore
src/lib/hours/demo.ts             demoEntries(today)
src/lib/hours/__tests__/store.test.ts
src/app/screener/Screener.tsx     v2 (question | checklist | result)
src/app/screener/Checklist.tsx    new
src/app/screener/Result.tsx       v2 (next steps)
src/app/log/page.tsx              server shell
src/app/log/HourLog.tsx           client: ring, pace, flags, list
src/app/log/EntryForm.tsx         client: add/edit
src/app/log/Ring.tsx              SVG 80-hour ring
src/components/ui/DemoBanner.tsx
src/app/page.tsx                  + "Track my hours" + "Try the demo"
messages/en.json, messages/es.json
e2e/screener.spec.ts              rewritten for v2
e2e/log.spec.ts                   new
```

---

### Task 1: Housekeeping and shared helpers

**Files:** Modify `package.json`, rename `vitest.config.ts` → `vitest.config.mts`, modify `next.config.ts`, `scripts/measure-js.mjs` (only the import, if needed), `src/app/layout.tsx`. Create `src/lib/dates.ts`, `src/lib/storage/safe.ts`, `src/lib/dates.test.ts`, `src/lib/storage/safe.test.ts`. Modify every current caller of the moved or duplicated code (`engine.ts`, `Screener.tsx`, `ThemeToggle.tsx`, `LanguageSwitch.tsx`, `page.tsx`, and anything else `grep -rn "localStorage\|sessionStorage\|document.cookie" src` finds).

**Interfaces (produces):**
```ts
// src/lib/dates.ts
export function californiaDate(now?: Date): string          // 'YYYY-MM-DD' in America/Los_Angeles
export function monthOf(date: string): string               // '2026-10-31' -> '2026-10'
export function daysInMonth(month: string): number          // '2026-02' -> 28
export function addMonths(month: string, n: number): string // '2026-12', 1 -> '2027-01'
// src/lib/storage/safe.ts
export type Area = 'local' | 'session'
export function safeGet(area: Area, key: string): string | null
export function safeSet(area: Area, key: string, value: string): void
export function safeRemove(area: Area, key: string): void
export function setLocaleCookie(locale: 'en' | 'es'): void   // NEXT_LOCALE, path=/, 1 year, SameSite=Lax
```

- [ ] **Step 1: tests first.** `dates.test.ts`: `californiaDate(new Date('2026-11-01T06:30:00Z'))` → `'2026-10-31'` (11:30 p.m. PDT); `monthOf('2026-10-31')` → `'2026-10'`; `daysInMonth` for 2026-02 (28), 2028-02 (29), 2026-10 (31); `addMonths('2026-12', 1)` → `'2027-01'` and `addMonths('2027-01', -1)` → `'2026-12'`. `safe.test.ts`: with `globalThis.localStorage` stubbed to throw on every access, `safeGet` returns null and `safeSet`/`safeRemove` don't throw; with a working in-memory stub, a value round-trips. Run: FAIL.
- [ ] **Step 2: implement** both files. Move `californiaDate` out of `engine.ts` and re-export it from the engine so existing imports keep working. Replace every duplicated try/catch storage block with the helpers (no behavior change).
- [ ] **Step 3: housekeeping.** Rename to `vitest.config.mts`. Set `turbopack: { root: __dirname }` in `next.config.ts` (check the Next 16 docs for the key's name). Replace `z.string().url()` with `z.url()`. Add `playwright` explicitly to devDependencies at the same version as `@playwright/test`. Add `"measure": "node scripts/measure-js.mjs"`. `themeColor`: return both `{ media: '(prefers-color-scheme: light)', color: <light bg> }` and the dark equivalent from the `viewport` export, and have ThemeToggle update the `<meta name="theme-color">` content when the theme flips (guarded). Run `npm run postinstall` after installs.
- [ ] **Step 4:** `npm test` (all pass, **no ESM/CJS warning** in the output), `npm run typecheck`, `npm run build` (**no** "ignored package-lock.json" warning), `npm run e2e` (20/20: nothing behavioral changed). Paste the outputs with exit codes.
- [ ] **Step 5: commit** `chore: shared date/storage helpers, config warnings, theme-color per theme`

### Task 2: Rule data: short labels + stricter schema

**Files:** Modify `rules/ca-calfresh-2026.json`, `src/lib/rules/schema.ts`, `src/lib/rules/__tests__/schema.test.ts`, `src/lib/rules/__tests__/real-file.test.ts`, `docs/AI-USE.md`

**Interfaces (produces):** `Rule` gains `label_en?: string` and `label_es?: string | null`, required (non-empty) when `kind === 'exemption'`. A label is a first-person statement under ~40 characters that completes "I think I don't have to meet the work rule because: …" and works as checkbox text.

- [ ] **Step 1: failing schema tests** (append to `schema.test.ts`):
  - an exemption rule without `label_en` is rejected (`/label_en/`)
  - `kind: 'exemption'` with `outcomeIfYes` other than `'likely_exempt'` is rejected
  - `kind: 'scope'` with anything other than `'not_subject'` is rejected
  - `kind: 'info'` with `'likely_exempt'` is rejected
  - `reviewedAt` set while `reviewer` is null is rejected (and the reverse)
- [ ] **Step 2:** implement in `RuleSchema.superRefine` / `RuleSetSchema.superRefine`. Run: PASS.
- [ ] **Step 3: write the 13 labels (en + es).** Derive each ONLY from that rule's `question_en` and `sourceQuote`. Don't widen or narrow the meaning. Examples of the expected register (adapt, verify against each rule):
  - child_under_14_calfresh_household: "A child under 14 is in my CalFresh household" / "Un niño menor de 14 años está en mi hogar de CalFresh"
  - pregnant: "I'm pregnant" / "Estoy embarazada"
  - work_30h_or_217_50: "I work 30+ hours a week or earn $217.50+ a week" / "Trabajo 30+ horas por semana o gano $217.50+ por semana"
  - school_half_time: "I'm in school or training at least half-time" / "Estudio o me capacito al menos medio tiempo"

  For the Spanish, use usted-free first person, gender-inclusive where needed ("embarazada" is inherently feminine and fine).
- [ ] **Step 4: real-file tests.** Every exemption rule has `label_en` and `label_es`. Every `label_en` is ≤ 48 characters. No label contains "exempt"/"exento". Add a row to `docs/AI-USE.md`: "Checklist labels drafted by AI from question_en + sourceQuote; need caseworker and native review."
- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npm run build` (the prebuild validates the file). **Commit** `feat(rules): short checklist labels and stricter rule schema`

### Task 3: Screener engine v2 (screens + checklist)

**Files:** Modify `src/lib/rules/engine.ts`, `src/lib/rules/__tests__/engine.test.ts`, `src/lib/rules/__tests__/real-file.test.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleSet` (Task 2); `californiaDate` (Task 1).
- Produces:
```ts
export type Answer = 'yes' | 'no' | 'unsure'
export const CHECKLIST = '__exemptions'
export type Answers = Readonly<Record<string, Answer>>
export type Screen =
  | { type: 'question'; rule: Rule }
  | { type: 'checklist'; rules: readonly Rule[]; notes: readonly Rule[] }
export type FinalOutcome = 'not_subject' | 'likely_exempt' | 'meeting_requirement' | 'ask_county' | 'subject'
export type Step =
  | { type: 'question'; rule: Rule; index: number; total: number }
  | { type: 'checklist'; rules: readonly Rule[]; notes: readonly Rule[]; index: number; total: number }
  | { type: 'result'; outcome: FinalOutcome; ruleIds: readonly string[]; unsureAt: string | null }
export type DisplayOutcome = FinalOutcome | 'possibly_exempt'
export type Lang = 'en' | 'es'
export function activeRules(set: RuleSet, now?: Date): readonly Rule[]
export function screens(set: RuleSet, now?: Date): readonly Screen[]
export function nextStep(set: RuleSet, answers: Answers, now?: Date): Step
export function goBack(set: RuleSet, answers: Answers, now?: Date): Answers
export function checklistAnswers(set: RuleSet, checkedIds: readonly string[], mode: 'continue' | 'none' | 'unsure', now?: Date): Answers
export function displayOutcome(set: RuleSet, step: Extract<Step, { type: 'result' }>): DisplayOutcome
export function ruleText(rule: Rule, lang: Lang): { question: string; hint: string | null; proof: string | null; label: string | null; questionFallback: boolean; hintFallback: boolean; proofFallback: boolean; labelFallback: boolean }
export function countyScript(set: RuleSet, step: Extract<Step, { type: 'result' }>, lang: Lang): string | null
```
`unsureAt` is the rule id (or `CHECKLIST`) where the user answered "not sure", or null.

- [ ] **Step 1: failing tests.** Replace `engine.test.ts`'s fixture with one that has the v2 shape. Keep every Phase 1 test's *intent*, adapted to screens.
```ts
import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'
import { CHECKLIST, checklistAnswers, countyScript, displayOutcome, goBack, nextStep, screens, type Answers } from '../engine'

const base = { sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence: 'confirmed' as const }
const set = (reviewedAt: string | null = null, extra: Record<string, unknown>[] = []) => parseRuleSet({
  version: 't', reviewedAt, reviewer: reviewedAt ? 'Advocate' : null,
  generalSourceUrl: 'https://example.gov/g', county: { name: 'SC', phone: '(408) 000-0000', sourceUrl: 'https://example.gov' },
  rules: [
    { ...base, id: 'age', kind: 'scope', outcomeIfYes: 'not_subject', question_en: 'age?', question_es: '¿edad?' },
    { ...base, id: 'pregnant', kind: 'exemption', outcomeIfYes: 'likely_exempt', question_en: 'pregnant?', question_es: null, label_en: "I'm pregnant", label_es: 'Estoy embarazada', proofThatHelps_en: 'note' },
    { ...base, id: 'shaky', kind: 'exemption', outcomeIfYes: 'likely_exempt', question_en: 'shaky?', question_es: null, label_en: 'Shaky reason', label_es: null, confidence: 'unclear' },
    { ...base, id: 'unfit', kind: 'info', outcomeIfYes: 'ask_county', question_en: 'unfit?', question_es: null },
    { ...base, id: 'veteran', kind: 'info', outcomeIfYes: 'continue', question_en: 'veteran?', question_es: null, hint_en: 'Veterans are not automatically exempt.' },
    { ...base, id: 'meeting', kind: 'info', outcomeIfYes: 'meeting_requirement', question_en: '20h?', question_es: null },
    ...extra,
  ] })
const pastChecklist: Answers = { age: 'no', [CHECKLIST]: 'yes', pregnant: 'no', shaky: 'no' }

describe('screens', () => {
  test('scope questions, one checklist, then info questions; continue-rules become notes', () => {
    const s = screens(set())
    expect(s.map((x) => (x.type === 'question' ? x.rule.id : 'checklist'))).toEqual(['age', 'checklist', 'unfit', 'meeting'])
    const c = s[1]
    expect(c.type === 'checklist' && c.rules.map((r) => r.id)).toEqual(['pregnant', 'shaky'])
    expect(c.type === 'checklist' && c.notes.map((r) => r.id)).toEqual(['veteran'])
  })
})

describe('nextStep', () => {
  test('starts at question 1 of 4', () => expect(nextStep(set(), {})).toMatchObject({ type: 'question', index: 0, total: 4 }))
  test('scope yes ends with not_subject', () =>
    expect(nextStep(set(), { age: 'yes' })).toEqual({ type: 'result', outcome: 'not_subject', ruleIds: ['age'], unsureAt: null }))
  test('after scope, the checklist', () => expect(nextStep(set(), { age: 'no' })).toMatchObject({ type: 'checklist', index: 1 }))
  test('checked items give likely_exempt with every checked id', () =>
    expect(nextStep(set(), checklistAnswers(set(), ['pregnant', 'shaky'], 'continue'))).toMatchObject({ outcome: 'likely_exempt', ruleIds: ['pregnant', 'shaky'] }))
  test('none of these continues to the next question', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), [], 'none') })).toMatchObject({ type: 'question', rule: { id: 'unfit' } }))
  test('not sure with nothing checked asks the county', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), [], 'unsure') })).toMatchObject({ outcome: 'ask_county', unsureAt: CHECKLIST, ruleIds: [] }))
  test('not sure with something checked still reports the checked items', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), ['pregnant'], 'unsure') })).toMatchObject({ outcome: 'likely_exempt', ruleIds: ['pregnant'] }))
  test('unsure on the 20-hours question asks the county, never meeting_requirement', () =>
    expect(nextStep(set(), { ...pastChecklist, unfit: 'no', meeting: 'unsure' })).toMatchObject({ outcome: 'ask_county', unsureAt: 'meeting' }))
  test('meeting 20h is its own result, never exempt', () =>
    expect(nextStep(set(), { ...pastChecklist, unfit: 'no', meeting: 'yes' })).toMatchObject({ outcome: 'meeting_requirement', ruleIds: ['meeting'] }))
  test('all no means subject to the rule', () =>
    expect(nextStep(set(), { ...pastChecklist, unfit: 'no', meeting: 'no' })).toEqual({ type: 'result', outcome: 'subject', ruleIds: [], unsureAt: null }))
})

describe('checklistAnswers', () => {
  test('continue marks checked yes and the rest no', () =>
    expect(checklistAnswers(set(), ['pregnant'], 'continue')).toEqual({ [CHECKLIST]: 'yes', pregnant: 'yes', shaky: 'no' }))
  test('continue with nothing checked is a programming error', () =>
    expect(() => checklistAnswers(set(), [], 'continue')).toThrow())
  test('unknown ids are rejected', () => expect(() => checklistAnswers(set(), ['nope'], 'continue')).toThrow())
})

describe('goBack', () => {
  test('from a checklist result back to the checklist, keeping the boxes checked for re-display', () => {
    const a = { age: 'no', ...checklistAnswers(set(), ['pregnant'], 'continue') } as Answers
    const back = goBack(set(), a)
    expect(nextStep(set(), back)).toMatchObject({ type: 'checklist' })
    expect(back).toMatchObject({ age: 'no', pregnant: 'yes' })
    expect(back).not.toHaveProperty(CHECKLIST)
  })
  test('from the question after the checklist back to the checklist', () => {
    const back = goBack(set(), pastChecklist)
    expect(nextStep(set(), back)).toMatchObject({ type: 'checklist' })
  })
  test('from the checklist back to question 1 clears the checklist answers', () => {
    expect(goBack(set(), { age: 'no' })).toEqual({})
  })
  test('at question 1 is a no-op', () => expect(goBack(set(), {})).toEqual({}))
  test('from the subject result drops the last question only', () =>
    expect(goBack(set(), { ...pastChecklist, unfit: 'no', meeting: 'no' })).toEqual({ ...pastChecklist, unfit: 'no' }))
})

describe('displayOutcome (safety gate)', () => {
  const ex = (ids: string[]) => ({ type: 'result', outcome: 'likely_exempt', ruleIds: ids, unsureAt: null }) as const
  test('unreviewed never says likely exempt', () => expect(displayOutcome(set(null), ex(['pregnant']))).toBe('possibly_exempt'))
  test('reviewed + a confirmed checked rule says likely exempt', () => expect(displayOutcome(set('2026-10-10'), ex(['pregnant', 'shaky']))).toBe('likely_exempt'))
  test('reviewed but only unclear rules stays possibly', () => expect(displayOutcome(set('2026-10-10'), ex(['shaky']))).toBe('possibly_exempt'))
  test('unknown ids stay possibly', () => expect(displayOutcome(set('2026-10-10'), ex(['ghost']))).toBe('possibly_exempt'))
})

describe('countyScript', () => {
  const r = (over: object) => ({ type: 'result', outcome: 'likely_exempt', ruleIds: ['pregnant'], unsureAt: null, ...over }) as const
  test('lists checked labels in English', () =>
    expect(countyScript(set(), r({}), 'en')).toBe("I think I don't have to meet the CalFresh work rule because: I'm pregnant. Can you check my case?"))
  test('Spanish uses Spanish labels', () => expect(countyScript(set(), r({}), 'es')).toContain('Estoy embarazada'))
  test('unsure has its own script', () =>
    expect(countyScript(set(), r({ outcome: 'ask_county', ruleIds: [], unsureAt: 'meeting' }), 'en')).toMatch(/not sure/i))
  test('not_subject has no script', () => expect(countyScript(set(), r({ outcome: 'not_subject', ruleIds: ['age'] }), 'en')).toBeNull())
})

describe('validUntil still skips expired rules', () => {
  const expiring = { ...base, id: 'waiver', kind: 'scope', outcomeIfYes: 'not_subject', question_en: 'waiver?', question_es: null, validUntil: '2026-10-31' }
  test('asked on the last day, skipped the day after', () => {
    const s = set(null, [])
    const withWaiver = parseRuleSet({ ...s, rules: [s.rules[0], expiring, ...s.rules.slice(1)] })
    expect(nextStep(withWaiver, { age: 'no' }, new Date('2026-10-31T20:00:00Z'))).toMatchObject({ type: 'question', rule: { id: 'waiver' } })
    expect(nextStep(withWaiver, { age: 'no' }, new Date('2026-11-01T20:00:00Z'))).toMatchObject({ type: 'checklist' })
  })
})
```
Put the county-script strings in the engine as two small templates (en/es), not in messages. The engine must stay usable without next-intl. Templates:
- en: `"I think I don't have to meet the CalFresh work rule because: {labels}. Can you check my case?"`, unsure: `"I'm not sure if the CalFresh work rule applies to me. Can you check my case?"`
- es: `"Creo que no tengo que cumplir la regla de trabajo de CalFresh porque: {labels}. ¿Puede revisar mi caso?"`, unsure: `"No estoy seguro/a de si la regla de trabajo de CalFresh me aplica. ¿Puede revisar mi caso?"`
- Labels are joined with "; ". A missing `label_es` falls back to `label_en`.
- [ ] **Step 2:** `npm test -- src/lib/rules`. Expected: FAIL.
- [ ] **Step 3: implement.** Core logic (adapt freely, but keep these semantics):
```ts
export function screens(set: RuleSet, now: Date = new Date()): readonly Screen[] {
  const rules = activeRules(set, now)
  const exemptions = rules.filter((r) => r.kind === 'exemption')
  const notes = rules.filter((r) => r.kind === 'info' && r.outcomeIfYes === 'continue')
  const out: Screen[] = rules.filter((r) => r.kind === 'scope').map((rule) => ({ type: 'question', rule }))
  if (exemptions.length) out.push({ type: 'checklist', rules: exemptions, notes })
  for (const rule of rules) if (rule.kind === 'info' && rule.outcomeIfYes !== 'continue') out.push({ type: 'question', rule })
  return out
}

export function nextStep(set: RuleSet, answers: Answers, now: Date = new Date()): Step {
  const list = screens(set, now)
  const total = list.length
  for (let index = 0; index < total; index++) {
    const s = list[index]
    if (s.type === 'question') {
      const a = answers[s.rule.id]
      if (a === undefined) return { type: 'question', rule: s.rule, index, total }
      if (a === 'unsure') return { type: 'result', outcome: 'ask_county', ruleIds: [], unsureAt: s.rule.id }
      if (a === 'yes') return { type: 'result', outcome: s.rule.outcomeIfYes as FinalOutcome, ruleIds: [s.rule.id], unsureAt: null }
    } else {
      const a = answers[CHECKLIST]
      if (a === undefined) return { type: 'checklist', rules: s.rules, notes: s.notes, index, total }
      const checked = s.rules.filter((r) => answers[r.id] === 'yes').map((r) => r.id)
      if (checked.length) return { type: 'result', outcome: 'likely_exempt', ruleIds: checked, unsureAt: null }
      if (a === 'unsure') return { type: 'result', outcome: 'ask_county', ruleIds: [], unsureAt: CHECKLIST }
    }
  }
  return { type: 'result', outcome: 'subject', ruleIds: [], unsureAt: null }
}
```
`goBack`: find the screen that the current step sits on (for a result, the screen that produced it; for `subject`, the last screen) and drop that screen's key answers and every later screen's. Special case: going back *into* the checklist removes `CHECKLIST` but **keeps** the per-exemption yes/no answers, so the UI can re-check the boxes. Going back from the checklist to an earlier screen removes all of them. `displayOutcome`: likely only if `reviewedAt !== null` and some id in `ruleIds` resolves to a rule with `confidence === 'confirmed'`.
- [ ] **Step 4:** `npm test -- src/lib/rules`. Expected: PASS.
- [ ] **Step 5: real-file safety tests (migrate + extend).** In `real-file.test.ts`, replace the per-rule "no to everything before, yes to this" loop with: for **each** exemption rule in the shipped file, `checklistAnswers(ruleSet, [id], 'continue')` after "no" to every scope rule, then assert `displayOutcome` is `'possibly_exempt'`. Also check all 13 checked at once gives `'possibly_exempt'`, and the list of exemption rules is non-empty. Use a fixed `now` of `2026-10-01T19:00:00Z` so the waiver rule is active and the count is deterministic, and add one more run at `2026-11-02` showing the screen count drops by one.
- [ ] **Step 6:** `npm test`, `npm run typecheck`. The Phase 1 UI will fail to type-check against the new Step shape. That's expected: Task 4 owns the UI. To keep the build green between tasks, this task may add a **temporary** adapter in `Screener.tsx` that is only type-level (or mark the UI files as the next task's). **Ruling for the implementer:** do the minimum to make `npm run typecheck` and `npm run build` pass, and list it in the report; Task 4 removes it. **Commit** `feat(rules): screener engine v2 with exemption checklist`

### Task 4: Screener UI v2 (checklist + next-step results)

**Files:** Modify `src/app/screener/Screener.tsx`, `src/app/screener/Result.tsx`, `messages/en.json`, `messages/es.json`, `e2e/screener.spec.ts`, `src/app/globals.css` (print styles). Create `src/app/screener/Checklist.tsx`.

**Interfaces:** consumes all of Task 3's exports and `safeGet/safeSet` (Task 1). The storage key becomes **`hp.screener.v2`**, storing `{"rulesVersion": ruleSet.version, "answers": {...}}`. On restore, drop it if `rulesVersion` differs (ledger item M7).

- [ ] **Step 1: Checklist screen.** Heading: "Do any of these apply to you?" / "¿Le aplica alguna de estas situaciones?" Sub-line: "Check all that apply." Each exemption is a full-width checkbox row, 56px+, with its `label` (plus an "(English only)" tag if `labelFallback`). A "More about this" disclosure (`<details>`) per row shows the rule's `question` and `hint`, for people who need the longer wording. Veteran and other `notes` appear as a quiet note box below the list. Three buttons: **Continue** (primary, disabled until at least one box is checked), **None of these apply**, **I'm not sure**. Restoring after Back re-checks the boxes from answers. Focus moves to the heading on arrival.
- [ ] **Step 2: Result v2** (`Result.tsx`). Keep the title, body and verbatim not-a-decision line. Replace the single-rule block with sections that render only when they apply:
  1. **"Why"**: for likely/possibly exempt, the list of checked labels. For a result from a question with "yes", `becauseYes` with that question. For unsure, `becauseUnsure` with the question (or "the list of situations" for the checklist).
  2. **"What to bring"**: for exempt results, each checked rule's `proof` (with its fallback tag). **Never shown for `ask_county`, `meeting_requirement` or `subject`**, which closes the Phase 1 leftover.
  3. **"What to say"**: `countyScript()` in a quote box, with a "Copy" button (`navigator.clipboard.writeText`, guarded, showing "Copied" on success; hidden if the clipboard API is missing).
  4. **The call button** (existing).
  5. **"Start tracking my hours"**: a primary button to `/log`, shown for `subject` and `meeting_requirement` (and for `ask_county` as a secondary button: "Track hours while you check").
  6. **"Print or save this page"**: `window.print()`, secondary. The print stylesheet hides buttons, the theme toggle and the language switch, and prints the title, why, what to bring, what to say, the county name and phone, today's date (California) and the not-a-decision line.

  Every new string goes in en + es (parity test). Keep `result.<outcome>.title/body`. Adjust the `subject` body to point at tracking: "Start tracking now so you have proof ready." (es equivalent).
- [ ] **Step 3: e2e rewrite** (`e2e/screener.spec.ts`). Keep every Phase 1 case's intent, adapted:
  1. English, subject path: No to the scope questions, **"None of these apply"**, No, No → subject result. Assert **total screens answered ≤ 5**, the "Start tracking my hours" link goes to `/log`, and "What to bring" is not visible.
  2. The pregnant path: check "I'm pregnant" → Continue → "You may be exempt"; "likely exempt" absent from the whole page; "What to bring" visible; the script contains "I'm pregnant".
  3. Two exemptions checked → both labels in "Why" and both proofs in "What to bring".
  4. Back from the checklist result: the checklist shows with the box still checked; uncheck it → "None of these apply" → the next question appears.
  5. **"Not sure" on the 20-hours question:** ask-county result; the text "you are meeting it" / "lo está cumpliendo" absent; "What to bring" absent; the script says "not sure".
  6. The checklist "I'm not sure" with nothing checked → ask-county, and the call href is `tel:+14087583800`.
  7. Spanish: the checklist heading, a Spanish label, and the Spanish not-a-decision line on the result; no "(solo en inglés)" anywhere on these screens.
  8. Reload on the checklist with two boxes checked (before Continue is pressed, boxes needn't persist; after Back from a result they must).
  9. Blocked storage (the Phase 1 case 7, adapted).
  10. Without JS: question 1 and the noscript phone still render (the Phase 1 case, adapted).
  11. Print: `page.emulateMedia({ media: 'print' })` on a result; buttons hidden and the script and phone visible.
  12. The mid-screener language switch still keeps the position (the Phase 1 case, adapted).
- [ ] **Step 4:** re-capture the result and checklist screenshots (light, dark, es) into `docs/screenshots/phase2/` and look at them.
- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`, `npm run measure` (`/screener` under 200 KB). **Commit** `feat(screener): 4-screen checklist flow with next-step results`

### Task 5: Hours engine (pure, TDD)

**Files:** Create `src/lib/hours/types.ts`, `src/lib/hours/summarize.ts`, `src/lib/hours/__tests__/summarize.test.ts`

**Interfaces (produces):**
```ts
export const ACTIVITY_TYPES = ['work', 'volunteer', 'program', 'job_search', 'workfare'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
export type Entry = {
  id: string; date: string /* YYYY-MM-DD */; type: ActivityType; hours: number
  inProgram?: boolean /* job_search only: part of an E&T/WIOA/Trade Act program */
  place?: string; note?: string; createdAt: string /* ISO */
}
export type Flag = 'workfare_mixed' | 'job_search_outside_program' | 'job_search_capped' | 'behind_pace'
export type MonthStatus = 'met' | 'on_track' | 'behind' | 'not_started' | 'future'
export type MonthSummary = {
  month: string; target: 80; counted: number; remaining: number
  byType: Record<ActivityType, number>; jobSearchCounted: number
  daysInMonth: number; daysElapsed: number; daysLeft: number
  projected: number; neededPerDay: number | null
  status: MonthStatus; flags: Flag[]
}
export type EntryError = 'bad_date' | 'bad_hours' | 'too_many_hours_that_day' | 'in_program_only_for_job_search'
export function validateEntry(entry: Entry, sameDayOthers: readonly Entry[]): EntryError[]
export function summarizeMonth(entries: readonly Entry[], month: string, today: string): MonthSummary
```
**Counting rules** (from research rows 6, 6b, 7; put the source URLs in comments):
- `counted = work + volunteer + program + jobSearchCounted`
- `jobSearchCounted = min(jobSearchInProgram, max(0, program − 0.25))`: job search counts only as part of a program and only while it's less than the program's own hours. Add flag `job_search_capped` when it was cut, and `job_search_outside_program` when any job search is outside a program (not counted).
- Workfare is never added to `counted`. Add flag `workfare_mixed` when workfare > 0 and any other activity > 0.
- **Do all math in integer quarter-hours** (hours × 4) and convert back at the end, so there's no float drift.
- `validateEntry`: date is a real YYYY-MM-DD; hours > 0, ≤ 24, a multiple of 0.25; the day's total including others is ≤ 24; `inProgram` only on job_search.
- Time: `today` is a California date. For the current month, `daysElapsed = day(today)`, `daysLeft = daysInMonth − daysElapsed`. A past month has all days elapsed and 0 left. For a future month, status is `future`.
- `projected = counted / daysElapsed × daysInMonth` (0 if daysElapsed is 0). `neededPerDay = remaining / daysLeft`, or null when daysLeft is 0 or the month is met.
- Status: `met` if counted ≥ 80; `not_started` if counted = 0 in the current month; `on_track` if projected ≥ 80; else `behind` (+ flag `behind_pace`). A past month under 80 is `behind`.

- [ ] **Step 1: failing tests** (`summarize.test.ts`); write them all before the implementation:
```ts
import { describe, expect, test } from 'vitest'
import { summarizeMonth, validateEntry } from '../summarize'
import type { Entry } from '../types'

let n = 0
const e = (date: string, type: Entry['type'], hours: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `e${n++}`, date, type, hours, createdAt: '2026-10-01T00:00:00Z', ...over })

describe('summarizeMonth', () => {
  test('sums work, volunteer and program together', () => {
    const s = summarizeMonth([e('2026-10-02', 'work', 30), e('2026-10-03', 'volunteer', 20), e('2026-10-04', 'program', 10)], '2026-10', '2026-10-15')
    expect(s.counted).toBe(60)
    expect(s.remaining).toBe(20)
  })
  test('only counts entries in the month (31st belongs to its own month)', () => {
    const s = summarizeMonth([e('2026-10-31', 'work', 8), e('2026-11-01', 'work', 8)], '2026-10', '2026-10-31')
    expect(s.counted).toBe(8)
  })
  test('quarter hours add exactly to 80 and meet the rule', () => {
    const entries = [e('2026-10-01', 'work', 79.75), e('2026-10-02', 'work', 0.25)]
    const s = summarizeMonth(entries, '2026-10', '2026-10-20')
    expect(s.counted).toBe(80)
    expect(s.status).toBe('met')
    expect(s.neededPerDay).toBeNull()
  })
  test('job search outside a program is not counted and is flagged', () => {
    const s = summarizeMonth([e('2026-10-02', 'work', 10), e('2026-10-03', 'job_search', 5)], '2026-10', '2026-10-10')
    expect(s.counted).toBe(10)
    expect(s.flags).toContain('job_search_outside_program')
  })
  test('job search in a program counts only while under the program hours', () => {
    const s = summarizeMonth([e('2026-10-02', 'program', 10), e('2026-10-03', 'job_search', 12, { inProgram: true })], '2026-10', '2026-10-10')
    expect(s.jobSearchCounted).toBe(9.75)
    expect(s.counted).toBe(19.75)
    expect(s.flags).toContain('job_search_capped')
  })
  test('job search in a program with no program hours counts nothing', () => {
    const s = summarizeMonth([e('2026-10-03', 'job_search', 5, { inProgram: true })], '2026-10', '2026-10-10')
    expect(s.jobSearchCounted).toBe(0)
  })
  test('workfare is not counted and is flagged when mixed', () => {
    const s = summarizeMonth([e('2026-10-02', 'workfare', 20), e('2026-10-03', 'work', 10)], '2026-10', '2026-10-10')
    expect(s.counted).toBe(10)
    expect(s.byType.workfare).toBe(20)
    expect(s.flags).toContain('workfare_mixed')
  })
  test('pace: on track vs behind, with hours needed per day', () => {
    const on = summarizeMonth([e('2026-10-01', 'work', 30)], '2026-10', '2026-10-10')
    expect(on.status).toBe('on_track') // 30/10*31 = 93
    const behind = summarizeMonth([e('2026-10-01', 'work', 20)], '2026-10', '2026-10-20')
    expect(behind.status).toBe('behind')
    expect(behind.flags).toContain('behind_pace')
    expect(behind.neededPerDay).toBeCloseTo(60 / 11, 2)
  })
  test('empty current month is not_started; future month is future; past month under 80 is behind', () => {
    expect(summarizeMonth([], '2026-10', '2026-10-05').status).toBe('not_started')
    expect(summarizeMonth([], '2026-11', '2026-10-05').status).toBe('future')
    const past = summarizeMonth([e('2026-09-10', 'work', 40)], '2026-09', '2026-10-05')
    expect(past).toMatchObject({ status: 'behind', daysLeft: 0, neededPerDay: null })
  })
})

describe('validateEntry', () => {
  test('rejects bad hours', () => {
    expect(validateEntry(e('2026-10-01', 'work', 0), [])).toContain('bad_hours')
    expect(validateEntry(e('2026-10-01', 'work', 1.1), [])).toContain('bad_hours')
    expect(validateEntry(e('2026-10-01', 'work', 25), [])).toContain('bad_hours')
  })
  test('rejects more than 24 hours in a day across entries', () =>
    expect(validateEntry(e('2026-10-01', 'work', 10), [e('2026-10-01', 'volunteer', 15)])).toContain('too_many_hours_that_day'))
  test('rejects impossible dates', () => expect(validateEntry(e('2026-02-30', 'work', 1), [])).toContain('bad_date'))
  test('inProgram only for job search', () =>
    expect(validateEntry(e('2026-10-01', 'work', 1, { inProgram: true }), [])).toContain('in_program_only_for_job_search'))
  test('a good entry has no errors', () => expect(validateEntry(e('2026-10-01', 'volunteer', 3.5), [])).toEqual([]))
})
```
- [ ] **Step 2:** run: FAIL. **Step 3:** implement (quarter-hour integers). **Step 4:** run: PASS. **Step 5: commit** `feat(hours): month summary engine with CalFresh counting rules`

### Task 6: Device store + demo data

**Files:** Create `src/lib/hours/store.ts`, `src/lib/hours/demo.ts`, `src/lib/hours/__tests__/store.test.ts`. Modify `package.json` (`idb` dependency; `fake-indexeddb` dev dependency; run `npm run postinstall` after installing).

**Interfaces (produces):**
```ts
export type Mode = 'real' | 'demo'
export interface EntryStore {
  list(month?: string): Promise<Entry[]>   // sorted by date desc, then createdAt desc
  get(id: string): Promise<Entry | undefined>
  put(entry: Entry): Promise<void>         // validates with validateEntry against same-day entries; throws EntryValidationError with codes
  remove(id: string): Promise<void>
  clear(): Promise<void>
}
export class EntryValidationError extends Error { codes: EntryError[] }
export function openStore(mode: Mode): Promise<EntryStore>        // DB 'hourproof' or 'hourproof-demo', store 'entries', index 'date'
export function getMode(): Mode                                    // safeGet('session','hp.mode') === 'demo' ? 'demo' : 'real'
export function setMode(mode: Mode): void
export function demoEntries(today: string): Entry[]               // deterministic, current month of `today`
export async function startDemo(today: string): Promise<void>     // clear demo DB, seed demoEntries, setMode('demo')
export async function exitDemo(): Promise<void>                   // clear demo DB, setMode('real')
```
Demo persona (a composite, like the PRD's "Marco"): variable warehouse shifts (work), two kitchen volunteer shifts, and one job-search entry outside a program (shows that flag). **Constraint:** the seed is spread over the days up to `today`, and its counted total is about 65% of the prorated target, so the demo shows "behind" with a clear hours-per-day number. If `today` is in the first 3 days of the month, seed the previous month too and have the UI open on it. Don't use real names or places: "Warehouse", "Community kitchen".

- [ ] **Step 1: failing tests** with `import 'fake-indexeddb/auto'` at the top of the test file (not globally):
  - put, then list(month) returns only that month's entries, sorted
  - put rejects an invalid entry with `EntryValidationError` codes, and nothing is written
  - put rejects when the same-day total would exceed 24 (it reads the same-day entries itself)
  - an edit (put with the same id) replaces the entry, and the same-day check excludes the entry's own old hours
  - remove, then get is undefined
  - **isolation:** write to `real`, `startDemo`, add to `demo`, `exitDemo` → `real` is unchanged and `demo` is empty. Also true when `real` started empty.
  - `demoEntries('2026-10-20')` passes `validateEntry`, all fall in October on or before the 20th, and `summarizeMonth(...).status === 'behind'`
  - `demoEntries('2026-10-02')` includes previous-month entries
- [ ] **Step 2:** FAIL. **Step 3:** implement with `idb`'s `openDB` (version 1, upgrade creates the store and the `date` index). **Step 4:** PASS. Also check `npm run build`: the store must only be imported from client components, so it never runs on the server.
- [ ] **Step 5: commit** `feat(hours): IndexedDB entry store with isolated demo data`

### Task 7: Hour log UI

**Files:** Create `src/app/log/page.tsx`, `src/app/log/HourLog.tsx`, `src/app/log/EntryForm.tsx`, `src/app/log/Ring.tsx`, `src/components/ui/DemoBanner.tsx`. Modify `messages/en.json`, `messages/es.json`, `src/components/ui/Screen.tsx` (only if the banner slot needs it).

**Behavior:**
- **`/log`** (one route; the form is a view inside it, switched by state and a `?add=1` / `?edit=<id>` search param, so no extra routes load):
  - Header: month name with prev/next buttons (48px), using `addMonths`. It never goes past the current month.
  - **Ring** (`Ring.tsx`): an SVG donut, 220px, `stroke` in the `proof` token for counted hours, a neutral track in `surface-2`, and at least a 20px thick stroke. The center shows **"52"** big and "of 80 hours" small. When met, a check mark and "Done for this month". Honor `prefers-reduced-motion` (animate the arc only when reduced motion is off, 200ms). `role="img"` with an aria-label ("52 of 80 hours this month").
  - **Pace line** (from `summarizeMonth`), by status:
    - on_track: "On track. At this pace you'll reach {projected} hours."
    - behind: "You need {remaining} more hours in {daysLeft} days — about {neededPerDay} a day."
    - met: "You have 80 hours this month. Keep proof of every hour."
    - not_started: "No hours yet this month."
    - Numbers are rounded to 1 decimal, with a locale-aware format.
  - **Notes for flags**, in plain words, e.g. `job_search_outside_program`: "Job search on your own doesn't count. It only counts as part of a job program." `workfare_mixed`: "Workfare hours are checked differently by your county. Ask them." `behind_pace`: "If you're under 20 hours a week, tell your county within 10 days."
  - **"Add hours"**: a primary, full-width button.
  - **Entry list:** grouped by date (newest first), each row with the type label, hours, and place, plus an Edit button (48px). An empty state explains what counts: work, volunteering, and job programs.
  - A footer line: "Your hours are saved only on this phone." A link: "Check if the rule applies to you" → `/screener`.
- **EntryForm:**
  - date (a native `<input type="date">`, default today, max today)
  - type as 5 big radio cards with plain labels + one-line hints ("Paid work", "Volunteering", "Job training or program (like CalFresh E&T or WIOA)", "Job search", "Workfare")
  - hours with −/+ buttons (0.25 steps) and quick chips (1, 2, 4, 8), plus a number input (`inputMode="decimal"`)
  - "Part of a job program?" checkbox, only for job search
  - place and note (optional, short text)
  - Save / Cancel; Delete (only when editing, with a confirm step)
  - Validation errors come from `EntryValidationError` codes, as localized messages next to the field. Focus goes to the first error.
- **DemoBanner:** shown when `getMode() === 'demo'` on `/log` (and on `/`), in a `pace`-toned bar: "Demo — sample data, not yours." with an "Exit demo" button (it calls `exitDemo()`, then routes to `/`).
- All strings are in en + es (parity test). The new client JS must keep `/log` under 200 KB: lazy-import nothing heavy, and don't import `zod` or the rules on this route.
- [ ] **Step 1:** build the components; `npm run typecheck`; `npm run build`.
- [ ] **Step 2: e2e** `e2e/log.spec.ts` (the IndexedDB is fresh per Playwright context):
  1. The empty state, then add 4 hours of volunteering today → the ring label says "4 of 80" and the entry appears in the list.
  2. Edit it to 6 → "6 of 80". Delete it with confirm → back to empty.
  3. Job search without "part of a program" → the flag note appears, and the count is unchanged.
  4. Validation: 25 hours → an error message, with focus on the hours field; nothing saved.
  5. **Offline entry:** load `/log`, `context.setOffline(true)`, add 2 hours → it appears and the ring updates; `setOffline(false)`.
  6. Spanish: the ring label and pace line in Spanish.
  7. Month navigation: the previous month shows as a past month, and "next" is disabled on the current month.
- [ ] **Step 3:** screenshots (light, dark, es; empty, behind, met, form) into `docs/screenshots/phase2/`, and look at them (ring legibility at 360px, tap sizes).
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`, `npm run measure` (add `/log` to the measured routes). **Commit** `feat(log): 80-hour ring, pace, notes, add/edit/delete entries`

### Task 8: Home entry points, the whole-loop demo, and the phase gate

**Files:** Modify `src/app/page.tsx`, `messages/*.json`, `scripts/measure-js.mjs` (routes), `e2e/log.spec.ts` (or a new `e2e/loop.spec.ts`), `docs/AI-USE.md`. Create `docs/plans/phase2-gate.md`.

- [ ] **Step 1: Home.** After the language choice, three clear actions in order: **"Check if the rule applies to you"** (primary), **"Track my hours"** (secondary → `/log`), **"Try the demo"** (tertiary: it calls `startDemo(californiaDate())` and routes to `/log`). The existing no-JS language form stays. The demo button needs JS; with JS off it's hidden, or it explains that.
- [ ] **Step 2: the whole-loop e2e** (`e2e/loop.spec.ts`), the demo video's script as a test:
  1. Home → Check → the screener subject path in ≤ 5 screens → "Start tracking my hours" → `/log` → add 8 hours of paid work → "8 of 80".
  2. Home → Try the demo → the banner visible, the ring shows the seeded number, status behind, and a pace line with hours per day → Exit demo → `/log` shows the real 8-hour entry from case 1 (same context), not the demo data.
- [ ] **Step 3:** `npm run measure`: `/`, `/screener`, `/log` all under 200 KB JS. Paste the table.
- [ ] **Step 4: gate report** `docs/plans/phase2-gate.md`: the real outputs (vitest, Playwright, build exit code, measure table), screenshots, what changed from Phase 1 (screens answered on the subject path, before vs. after), and the open items for Phase 3 (ShiftCred, Supabase anonymous auth) plus the human track. **Commit** `feat: home entry points, demo loop e2e, phase 2 gate`

---

## Human track (runs in parallel)
| By | Task | Why |
|---|---|---|
| Sep 28 | Register on congressionalappchallenge.us (parent contact, 9-digit ZIPs, the quiz) | Unlocks the application |
| Sep 29 | Send the caseworker/legal-aid review ask, with `rules/ca-calfresh-2026.json` **and the new checklist labels** | The only path to "likely exempt" wording |
| Sep 29 | Email kitchens + Second Harvest (Claude can draft) | Pilot + what SCC accepts as volunteer proof |
| Oct 3 | Pilot go/no-go | |
| Oct 10 | Native Spanish review of `messages/es.json` and the rule/label Spanish | P0 |
| Anytime | Confirm (408) 758-3800 on the county's CalFresh page | The number on every result |

## Parallelism for agents
Sequential, T1 → T8 (the SDD rule). T5 (hours engine) touches nothing the screener tasks touch, so it could go first if a teammate wants the screener tasks.
