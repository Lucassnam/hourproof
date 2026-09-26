# Phase 1: Foundation + Exemption Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a deployed, installable Next 16 web app whose exemption screener takes someone from "pick a language" to a safe, sourced result in English or Spanish, on a cheap phone.

**Architecture:** The screener is a **pure TypeScript engine** (`src/lib/rules/`) that reads one validated JSON rule file. The UI (`src/app/screener/`) is a thin client component that holds answers in React state (and sessionStorage) and asks the engine for the next step. No server, no database and no account in this phase.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS v4, next-intl (no i18n routing; locale in a cookie), zod, Vitest, Playwright.

**Spec:** `docs/PRD-snapshot-2026-09-25.md` §"Exemption screener", corrected by `docs/plans/2026-09-25-master-plan.md` §"PRD corrections" and `docs/research/calfresh-rules-verification.md`. **Where the PRD and the research disagree, the research wins.**

## Global Constraints
- Node `>=20.9` for every npm script. `~/node_modules/.bin/node` is Node 18 and shadows npm scripts; the `postinstall` shim in Task 1 is required. Check with `npm exec -- node -v`.
- Every result screen shows, verbatim: **"This is not a decision. Only your county can decide."** / **"Esto no es una decisión. Solo su condado puede decidir."**
- The engine never produces the words "likely exempt" for display unless `reviewedAt` is non-null **and** the rule's `confidence` is `"confirmed"` (the `possibly_exempt` fallback).
- "Already working 20+ hrs/week" is never an exemption. It has its own `meeting_requirement` result.
- Body text 18px+, tap targets 48px+, contrast 4.5:1+ for every text/background token pair, in both themes.
- Light theme is the default. Dark is opt-in and remembered in `localStorage` (wrapped in try/catch).
- No personal data leaves the device in this phase. No analytics.
- Plain words at a 6th-grade reading level. Spanish strings drafted by AI are marked in `docs/AI-USE.md` as "needs native review."
- Every AI-written file gets a line in `docs/AI-USE.md`.

## Review Focus
1. **Going back after a terminal answer:** someone answers "yes" to *pregnant*, sees the result, taps Back, and changes it to "no". They must get the *next* question, not the stale result. (Engine test in Task 3.)
2. **An unreviewed rule file:** the shipped file has `reviewedAt: null`. Every exemption path must show the "you may be exempt — ask your county to confirm" wording, never "likely exempt". (Engine test in Task 3, e2e in Task 6.)
3. **A Spanish rule text that's missing:** a `question_es` of `null` must fall back to English with a visible "(English only)" tag, not a blank screen. (Engine test in Task 3.)
4. **Reload mid-screener:** a reload on question 7 must resume at question 7, not restart or crash when sessionStorage is blocked (private mode). (e2e in Task 6.)
5. **A malformed rule file:** a duplicate id, an unknown outcome or a missing source URL must fail the **build and tests**, not show up at runtime. (Schema test in Task 2.)

---

## File map
```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs, vitest.config.ts, playwright.config.ts
.gitignore, README.md, docs/AI-USE.md
rules/ca-calfresh-2026.json          the rule data (from docs/research/ca-calfresh-2026.draft.json + county block)
src/lib/rules/schema.ts               zod schema + parseRuleSet()
src/lib/rules/engine.ts               nextStep(), goBack(), displayOutcome(), ruleText()
src/lib/rules/load.ts                 imports the JSON, parses it once
src/lib/rules/__tests__/schema.test.ts
src/lib/rules/__tests__/engine.test.ts
src/lib/rules/__tests__/real-file.test.ts
src/lib/theme/tokens.ts               light + dark token values (single source)
src/lib/theme/contrast.ts             WCAG contrast ratio
src/lib/theme/__tests__/contrast.test.ts
src/app/globals.css                   Tailwind v4 + CSS variables per theme
src/app/layout.tsx                    html lang, theme boot script, NextIntlClientProvider
src/app/page.tsx                      language picker + "Check if the rule applies to you"
src/app/screener/page.tsx             server wrapper
src/app/screener/Screener.tsx         client state machine UI
src/app/screener/Result.tsx           result screen
src/components/ui/Button.tsx, ChoiceButtons.tsx, Screen.tsx, ThemeToggle.tsx
src/i18n/request.ts                   next-intl config (cookie locale)
messages/en.json, messages/es.json
public/manifest.webmanifest, public/icon-192.png, public/icon-512.png
e2e/screener.spec.ts
```

---

### Task 1: Scaffold with a Node that is actually Node 20+

**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `README.md`, `docs/AI-USE.md`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/smoke.test.ts`

**Interfaces:** Produces: the `npm run test`, `npm run build`, `npm run dev`, `npm run e2e` scripts used by every later task.

Do **not** use `npx create-next-app`: npx resolves the Node 18 shadow. Hand-scaffold.

- [ ] **Step 1: init + git**
```bash
cd ~/Desktop/Active/hourproof && git init -b main && npm init -y
```
- [ ] **Step 2: write package.json** (versions: take the current majors from `npm view <pkg> version` at install time; keep these majors)
```json
{
  "name": "hourproof",
  "private": true,
  "engines": { "node": ">=20.9" },
  "scripts": {
    "postinstall": "ln -sf \"$npm_node_execpath\" node_modules/.bin/node",
    "dev": "next dev -p 7050",
    "build": "next build",
    "start": "next start -p 7050",
    "test": "vitest run",
    "e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  }
}
```
```bash
npm i next@16 react@19 react-dom@19 next-intl zod
npm i -D typescript @types/node @types/react @types/react-dom tailwindcss@4 @tailwindcss/postcss vitest @playwright/test
```
- [ ] **Step 3: prove the shim works.** Run `npm exec -- node -v`. Expected: `v24.x` (or ≥20.9), **not** `v18.20.8`. If it's 18, stop and fix it first.
- [ ] **Step 4: minimal config files.** `tsconfig.json` (strict, `"paths": {"@/*": ["./src/*"]}`, `"resolveJsonModule": true`), `postcss.config.mjs` → `export default { plugins: { "@tailwindcss/postcss": {} } }`, `vitest.config.ts` with `resolve.alias['@'] = path.resolve(__dirname, 'src')`, `include: ['src/**/*.test.ts']`. `.gitignore`: `node_modules .next .env* test-results playwright-report`.
- [ ] **Step 5: smoke test** `src/lib/smoke.test.ts`: `import { expect, test } from 'vitest'; test('runs', () => expect(1 + 1).toBe(2))`. Run `npm test`. Expected: 1 passed.
- [ ] **Step 6: minimal app.** `layout.tsx` renders `<html lang="en"><body>{children}</body></html>`; `page.tsx` renders `<h1>HourProof</h1>`; `globals.css` = `@import "tailwindcss";`. Run `npm run build 2>&1 | tee /tmp/hp-build.log; echo "exit ${PIPESTATUS[0]}"`. Expected: `exit 0`.
- [ ] **Step 7: docs.** `README.md`: one paragraph on what the app is, plus the setup steps (`nvm use 24 && npm i && npm run dev`, with a note on the shim). `docs/AI-USE.md`: a table `| Date | File(s) | What AI did | What the team wrote/decided |`, with the first row for this scaffold.
- [ ] **Step 8: commit** `git add -A && git commit -m "chore: scaffold Next 16 app with Node 20+ shim"`

### Task 2: The rule file + schema (validation fails loudly)

**Files:** Create `rules/ca-calfresh-2026.json`, `src/lib/rules/schema.ts`, `src/lib/rules/load.ts`, `src/lib/rules/__tests__/schema.test.ts`, `src/lib/rules/__tests__/real-file.test.ts`

**Interfaces:** Produces:
```ts
export const OUTCOMES: readonly ['not_subject','likely_exempt','meeting_requirement','ask_county','continue']
export type Outcome = typeof OUTCOMES[number]
export type Rule = { id: string; question_en: string; question_es: string | null; kind: 'scope'|'exemption'|'info';
  outcomeIfYes: Outcome; proofThatHelps_en: string; proofThatHelps_es?: string | null;
  sourceUrl: string; sourceQuote: string; confidence: 'confirmed'|'unclear' }
export type County = { name: string; phone: string; sourceUrl: string }
export type RuleSet = { version: string; reviewedAt: string | null; reviewer: string | null; county: County; rules: Rule[] }
export function parseRuleSet(raw: unknown): RuleSet   // throws ZodError
export const ruleSet: RuleSet                          // from load.ts
```

- [ ] **Step 1: create the data file.** Copy `docs/research/ca-calfresh-2026.draft.json` to `rules/ca-calfresh-2026.json`. Add a top-level `"county"` object. **Get the Santa Clara County CalFresh phone number from an official county page (fetch it; don't use memory)** and put that page's URL in `county.sourceUrl`. Leave `reviewedAt` and `reviewer` null.
- [ ] **Step 2: failing schema tests** `schema.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'pregnant', question_en: 'Are you pregnant?', question_es: null, kind: 'exemption',
  outcomeIfYes: 'likely_exempt', proofThatHelps_en: 'A note from a clinic.',
  sourceUrl: 'https://example.gov/a', sourceQuote: 'quote', confidence: 'confirmed', ...over })
const set = (rules: unknown[], over: Record<string, unknown> = {}) => ({
  version: 't', reviewedAt: null, reviewer: null,
  county: { name: 'Santa Clara', phone: '000', sourceUrl: 'https://example.gov/c' }, rules, ...over })

describe('parseRuleSet', () => {
  test('accepts a valid set', () => expect(parseRuleSet(set([rule()])).rules).toHaveLength(1))
  test('rejects duplicate ids', () => expect(() => parseRuleSet(set([rule(), rule()]))).toThrow(/duplicate/i))
  test('rejects unknown outcome', () => expect(() => parseRuleSet(set([rule({ outcomeIfYes: 'exempt' })]))).toThrow())
  test('rejects missing source url', () => expect(() => parseRuleSet(set([rule({ sourceUrl: '' })]))).toThrow())
  test('rejects empty rule list', () => expect(() => parseRuleSet(set([]))).toThrow())
  test('rejects a non-date reviewedAt', () => expect(() => parseRuleSet(set([rule()], { reviewedAt: 'soon' }))).toThrow())
})
```
- [ ] **Step 3:** `npm test`. Expected: FAIL (cannot find `../schema`).
- [ ] **Step 4: implement** `schema.ts`:
```ts
import { z } from 'zod'

export const OUTCOMES = ['not_subject', 'likely_exempt', 'meeting_requirement', 'ask_county', 'continue'] as const
export type Outcome = (typeof OUTCOMES)[number]

const RuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  question_en: z.string().min(1),
  question_es: z.string().min(1).nullable(),
  kind: z.enum(['scope', 'exemption', 'info']),
  outcomeIfYes: z.enum(OUTCOMES),
  proofThatHelps_en: z.string().min(1),
  proofThatHelps_es: z.string().min(1).nullable().optional(),
  sourceUrl: z.string().url(),
  sourceQuote: z.string().min(1),
  confidence: z.enum(['confirmed', 'unclear']),
})

const RuleSetSchema = z
  .object({
    version: z.string().min(1),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    reviewer: z.string().min(1).nullable(),
    county: z.object({ name: z.string().min(1), phone: z.string().min(3), sourceUrl: z.string().url() }),
    rules: z.array(RuleSchema).min(1),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>()
    for (const r of s.rules) {
      if (seen.has(r.id)) ctx.addIssue({ code: 'custom', message: `duplicate rule id: ${r.id}` })
      seen.add(r.id)
    }
  })

export type Rule = z.infer<typeof RuleSchema>
export type RuleSet = z.infer<typeof RuleSetSchema>
export type County = RuleSet['county']
export const parseRuleSet = (raw: unknown): RuleSet => RuleSetSchema.parse(raw)
```
`load.ts`: `import raw from '../../../rules/ca-calfresh-2026.json'; export const ruleSet = parseRuleSet(raw)`.
- [ ] **Step 5: real-file test** `real-file.test.ts`: the shipped file parses; it has ≥18 rules; it contains the ids `child_under_14_calfresh_household`, `care_child_under_6`, `work_30h_or_217_50`, `school_half_time`, `meeting_80_hours`; `meeting_80_hours.outcomeIfYes === 'meeting_requirement'` (**never** `likely_exempt`); every `sourceUrl` starts with `https://`.
- [ ] **Step 6:** `npm test`. Expected: all pass. `npm run build` → exit 0 (the build fails if the JSON is malformed, because `load.ts` parses at import).
- [ ] **Step 7: commit** `feat(rules): validated CalFresh 2026 rule file`

### Task 3: Screener engine (pure, the safety-critical part)

**Files:** Create `src/lib/rules/engine.ts`, `src/lib/rules/__tests__/engine.test.ts`

**Interfaces:** Consumes `Rule`, `RuleSet` from Task 2. Produces:
```ts
export type Answer = 'yes' | 'no' | 'unsure'
export type Answers = Readonly<Record<string, Answer>>
export type FinalOutcome = 'not_subject' | 'likely_exempt' | 'meeting_requirement' | 'ask_county' | 'subject'
export type Step =
  | { type: 'question'; rule: Rule; index: number; total: number }
  | { type: 'result'; outcome: FinalOutcome; ruleId: string | null }
export type DisplayOutcome = FinalOutcome | 'possibly_exempt'
export type Lang = 'en' | 'es'
export function nextStep(set: RuleSet, answers: Answers): Step
export function goBack(set: RuleSet, answers: Answers): Answers
export function displayOutcome(set: RuleSet, step: Extract<Step, { type: 'result' }>): DisplayOutcome
export function ruleText(rule: Rule, lang: Lang): { question: string; proof: string; fallback: boolean }
```

- [ ] **Step 1: failing tests** `engine.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'
import { displayOutcome, goBack, nextStep, ruleText, type Answers } from '../engine'

const r = (id: string, kind: string, outcomeIfYes: string, confidence = 'confirmed') => ({
  id, question_en: `${id}?`, question_es: id === 'age' ? '¿edad?' : null, kind, outcomeIfYes,
  proofThatHelps_en: 'proof', sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence })
const set = (reviewedAt: string | null = null) => parseRuleSet({
  version: 't', reviewedAt, reviewer: reviewedAt ? 'Advocate' : null,
  county: { name: 'SC', phone: '000', sourceUrl: 'https://example.gov' },
  rules: [r('age', 'scope', 'not_subject'), r('pregnant', 'exemption', 'likely_exempt'),
          r('shaky', 'exemption', 'likely_exempt', 'unclear'), r('veteran', 'info', 'continue'),
          r('meeting', 'info', 'meeting_requirement')] })

describe('nextStep', () => {
  test('starts at the first rule', () => {
    const s = nextStep(set(), {})
    expect(s).toMatchObject({ type: 'question', index: 0, total: 5 })
  })
  test('scope yes ends with not_subject', () =>
    expect(nextStep(set(), { age: 'yes' })).toEqual({ type: 'result', outcome: 'not_subject', ruleId: 'age' }))
  test('exemption yes ends early', () =>
    expect(nextStep(set(), { age: 'no', pregnant: 'yes' })).toMatchObject({ outcome: 'likely_exempt', ruleId: 'pregnant' }))
  test('continue-kind yes moves on', () =>
    expect(nextStep(set(), { age: 'no', pregnant: 'no', shaky: 'no', veteran: 'yes' }))
      .toMatchObject({ type: 'question', rule: { id: 'meeting' } }))
  test('unsure routes to ask_county', () =>
    expect(nextStep(set(), { age: 'unsure' })).toMatchObject({ outcome: 'ask_county', ruleId: 'age' }))
  test('meeting 20h is its own result, never exempt', () =>
    expect(nextStep(set(), { age: 'no', pregnant: 'no', shaky: 'no', veteran: 'no', meeting: 'yes' }))
      .toMatchObject({ outcome: 'meeting_requirement' }))
  test('all no means subject to the rule', () =>
    expect(nextStep(set(), { age: 'no', pregnant: 'no', shaky: 'no', veteran: 'no', meeting: 'no' }))
      .toEqual({ type: 'result', outcome: 'subject', ruleId: null }))
  test('stale answers after a terminal answer are ignored', () =>
    expect(nextStep(set(), { age: 'yes', pregnant: 'yes' })).toMatchObject({ outcome: 'not_subject' }))
})

describe('goBack', () => {
  test('from a result removes the deciding answer, then the next question shows', () => {
    const a: Answers = { age: 'no', pregnant: 'yes' }
    const back = goBack(set(), a)
    expect(back).toEqual({ age: 'no' })
    expect(nextStep(set(), { ...back, pregnant: 'no' })).toMatchObject({ type: 'question', rule: { id: 'shaky' } })
  })
  test('from a question removes the previous answer', () =>
    expect(goBack(set(), { age: 'no' })).toEqual({}))
  test('at the first question is a no-op', () => expect(goBack(set(), {})).toEqual({}))
  test('from the all-no result removes the last answer', () =>
    expect(goBack(set(), { age: 'no', pregnant: 'no', shaky: 'no', veteran: 'no', meeting: 'no' }))
      .not.toHaveProperty('meeting'))
})

describe('displayOutcome (safety gate)', () => {
  const exempt = { type: 'result', outcome: 'likely_exempt', ruleId: 'pregnant' } as const
  test('unreviewed file never says likely exempt', () => expect(displayOutcome(set(null), exempt)).toBe('possibly_exempt'))
  test('reviewed + confirmed says likely exempt', () => expect(displayOutcome(set('2026-10-10'), exempt)).toBe('likely_exempt'))
  test('reviewed but unclear rule stays possibly', () =>
    expect(displayOutcome(set('2026-10-10'), { ...exempt, ruleId: 'shaky' })).toBe('possibly_exempt'))
  test('other outcomes pass through', () =>
    expect(displayOutcome(set(), { type: 'result', outcome: 'subject', ruleId: null })).toBe('subject'))
})

describe('ruleText', () => {
  test('spanish when present', () => expect(ruleText(set().rules[0], 'es')).toMatchObject({ question: '¿edad?', fallback: false }))
  test('falls back to english and flags it', () =>
    expect(ruleText(set().rules[1], 'es')).toMatchObject({ question: 'pregnant?', fallback: true }))
})
```
- [ ] **Step 2:** `npm test`. Expected: FAIL (module not found).
- [ ] **Step 3: implement** `engine.ts`:
```ts
import type { Rule, RuleSet } from './schema'

export type Answer = 'yes' | 'no' | 'unsure'
export type Answers = Readonly<Record<string, Answer>>
export type FinalOutcome = 'not_subject' | 'likely_exempt' | 'meeting_requirement' | 'ask_county' | 'subject'
export type Step =
  | { type: 'question'; rule: Rule; index: number; total: number }
  | { type: 'result'; outcome: FinalOutcome; ruleId: string | null }
export type DisplayOutcome = FinalOutcome | 'possibly_exempt'
export type Lang = 'en' | 'es'

export function nextStep(set: RuleSet, answers: Answers): Step {
  const total = set.rules.length
  for (let index = 0; index < total; index++) {
    const rule = set.rules[index]
    const answer = answers[rule.id]
    if (answer === undefined) return { type: 'question', rule, index, total }
    if (answer === 'unsure') return { type: 'result', outcome: 'ask_county', ruleId: rule.id }
    if (answer === 'yes' && rule.outcomeIfYes !== 'continue')
      return { type: 'result', outcome: rule.outcomeIfYes, ruleId: rule.id }
  }
  return { type: 'result', outcome: 'subject', ruleId: null }
}

export function goBack(set: RuleSet, answers: Answers): Answers {
  const step = nextStep(set, answers)
  const dropId =
    step.type === 'question'
      ? set.rules[step.index - 1]?.id
      : step.ruleId ?? set.rules[set.rules.length - 1].id
  if (!dropId) return answers
  // Keep only answers before the dropped rule, so stale answers further on can't resurface.
  const cut = set.rules.findIndex((r) => r.id === dropId)
  return Object.fromEntries(set.rules.slice(0, cut).filter((r) => r.id in answers).map((r) => [r.id, answers[r.id]]))
}

export function displayOutcome(set: RuleSet, step: Extract<Step, { type: 'result' }>): DisplayOutcome {
  if (step.outcome !== 'likely_exempt') return step.outcome
  const rule = set.rules.find((r) => r.id === step.ruleId)
  return set.reviewedAt !== null && rule?.confidence === 'confirmed' ? 'likely_exempt' : 'possibly_exempt'
}

export function ruleText(rule: Rule, lang: Lang) {
  const q = lang === 'es' ? rule.question_es : rule.question_en
  const p = lang === 'es' ? rule.proofThatHelps_es : rule.proofThatHelps_en
  return { question: q ?? rule.question_en, proof: p ?? rule.proofThatHelps_en, fallback: lang === 'es' && (!q || !p) }
}
```
- [ ] **Step 4:** `npm test`. Expected: all engine tests pass. If "from a question removes the previous answer" fails, the `cut` logic is wrong. Fix the code, not the test.
- [ ] **Step 5: real-file safety test.** Append to `real-file.test.ts`: for **every** rule with `outcomeIfYes === 'likely_exempt'`, answer "no" to all rules before it and "yes" to it, and assert `displayOutcome(ruleSet, step)` is `'possibly_exempt'` (the shipped file is unreviewed). This is the test that keeps the safety gate honest.
- [ ] **Step 6: commit** `feat(rules): screener engine with review gate`

### Task 4: Design tokens, themes and contrast proof

**Files:** Create `src/lib/theme/tokens.ts`, `src/lib/theme/contrast.ts`, `src/lib/theme/__tests__/contrast.test.ts`, `src/components/ui/ThemeToggle.tsx`; Modify `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:** Produces `tokens.light`, `tokens.dark` (`Record<TokenName, string>`), CSS variables `--bg --surface --surface-2 --text --text-muted --proof --pace --signal --danger`, Tailwind classes `bg-bg text-text bg-surface text-proof …`, and `<ThemeToggle/>`.

- [ ] **Step 1: tokens.ts.** Copy the PRD's light and dark hex values exactly (Brand direction table). `export const tokens = { light: {...}, dark: {...} } as const`.
- [ ] **Step 2: failing test** `contrast.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { contrast } from '../contrast'
import { tokens } from '../tokens'

test('known pair', () => expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0))
const TEXT = ['text', 'text-muted', 'proof', 'pace', 'signal', 'danger'] as const
const BG = ['bg', 'surface', 'surface-2'] as const
for (const mode of ['light', 'dark'] as const)
  describe(mode, () => {
    for (const fg of TEXT) for (const bg of BG)
      test(`${fg} on ${bg} >= 4.5`, () => expect(contrast(tokens[mode][fg], tokens[mode][bg])).toBeGreaterThanOrEqual(4.5))
  })
```
- [ ] **Step 3:** `npm test`. Expected: FAIL (no `contrast`).
- [ ] **Step 4: implement** `contrast.ts` (WCAG 2.1 relative luminance):
```ts
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
```
- [ ] **Step 5:** `npm test`. **If any pair fails, darken or lighten that token until it passes, and write the change in `docs/AI-USE.md` and the commit message.** Don't lower the threshold.
- [ ] **Step 6: CSS.** `globals.css`: `:root` holds the light values, `[data-theme="dark"]` holds the dark ones, then `@theme inline { --color-bg: var(--bg); ... }` so `bg-bg`, `text-text` and the rest work. Set `body { background: var(--bg); color: var(--text); font-size: 18px; }`. Fonts: Plus Jakarta Sans + Inter through `next/font/google` in `layout.tsx` (with the `latin-ext` subset for Spanish).
- [ ] **Step 7: theme boot + toggle.** In `layout.tsx`, an inline `<script>` in `<head>` reads `localStorage.theme` inside try/catch and sets `document.documentElement.dataset.theme` to `'dark'` only when the stored value is `'dark'` (light is the default; ignore `prefers-color-scheme`). `ThemeToggle` flips it and writes it back (try/catch). Add `suppressHydrationWarning` on `<html>`.
- [ ] **Step 8: commit** `feat(theme): light-default tokens with contrast tests`

### Task 5: Internationalization (English + Spanish, no routing)

**Files:** Create `src/i18n/request.ts`, `messages/en.json`, `messages/es.json`, `src/lib/i18n/__tests__/messages.test.ts`; Modify `next.config.ts`, `src/app/layout.tsx`

**Interfaces:** Produces the cookie `NEXT_LOCALE` (`'en'|'es'`), `useTranslations()` in client components, and the message namespaces `home`, `screener`, `result`, `common`.

- [ ] **Step 1:** Read the current next-intl docs for "App Router without i18n routing" (they change between majors) and follow them. `request.ts` reads `cookies().get('NEXT_LOCALE')` (await `cookies()` in Next 16), defaults to `'en'`, and loads `messages/${locale}.json`. `next.config.ts` wraps the config with `createNextIntlPlugin()`. `layout.tsx` sets `<html lang={locale}>` and wraps children in `NextIntlClientProvider`.
- [ ] **Step 2: failing test** `messages.test.ts`: flatten the keys of `en.json` and `es.json` and assert they're **identical sets**, and that no `es` value is empty. Also assert `es.result.notDecision === 'Esto no es una decisión. Solo su condado puede decidir.'` and the English equivalent.
- [ ] **Step 3: write the messages** (every UI string used in Tasks 6–7): home title, the language buttons, the CTA "Check if the rule applies to you" / "Vea si la regla le aplica", Yes / No / Not sure (Sí / No / No estoy seguro), Back, "Question {n} of {total}", "(English only)", a heading and body per result outcome (`not_subject`, `possibly_exempt`, `likely_exempt`, `meeting_requirement`, `ask_county`, `subject`), "What proof helps", "Call your county: {phone}", "Start over", and theme toggle labels. Draft the Spanish yourself, and add an AI-USE row: "es.json drafted by AI, needs native review."
  Result copy (English; keep the meaning exactly in Spanish):
  - `possibly_exempt`: "You may be exempt ({reason}). Ask your county to confirm."
  - `likely_exempt`: "You're likely exempt ({reason})." (only reachable after review)
  - `meeting_requirement`: "The rule applies to you, and right now you're meeting it. Keep proof of every hour."
  - `subject`: "The rule likely applies to you. You need 80 hours a month of work, volunteering or an approved program."
  - `ask_county`: "We can't tell from your answers. Your county can."
  - `not_subject`: "The rule likely doesn't apply to you."
- [ ] **Step 4:** `npm test` passes; `npm run build` exits 0.
- [ ] **Step 5: commit** `feat(i18n): en/es messages with parity test`

### Task 6: Screener UI + language picker

**Files:** Create `src/components/ui/{Button,ChoiceButtons,Screen}.tsx`, `src/app/screener/{page,Screener,Result}.tsx`, `playwright.config.ts`, `e2e/screener.spec.ts`; Modify `src/app/page.tsx`

**Interfaces:** Consumes `ruleSet`, `nextStep`, `goBack`, `displayOutcome`, `ruleText`, and the messages from Task 5.

- [ ] **Step 1: Home `/`.** Two big buttons, "English" and "Español". They set the `NEXT_LOCALE` cookie (a server action, or `document.cookie` then `router.refresh()`), then show the CTA to `/screener`. No sign-in anywhere.
- [ ] **Step 2: Screener.tsx (client).** Holds `answers` in state. On mount, restore from `sessionStorage['hp.screener']` inside try/catch; save on every change inside try/catch. Renders `nextStep(ruleSet, answers)`:
  - question → `Screen` with "Question {n} of {total}", the `ruleText(...).question` (plus the "(English only)" tag if `fallback`), `ChoiceButtons` (Yes / No / Not sure, each at least 56px tall and full width), and an always-visible Back that calls `goBack`. Move focus to the question heading on each step (for screen readers).
  - result → `<Result outcome={displayOutcome(...)} rule={...} county={ruleSet.county} />`.
- [ ] **Step 3: Result.tsx.** Heading and body for the outcome, "What proof helps" with the rule's `proof` text when there's a rule, the verbatim not-a-decision line, the county name and a `tel:` link with its phone, a "Source" link to the rule's `sourceUrl`, and "Start over" (clears answers and storage).
- [ ] **Step 4: e2e tests** `e2e/screener.spec.ts` (Playwright, `viewport: { width: 360, height: 740 }`, `webServer: { command: 'npm run build && npm start', port: 7050 }`):
  1. English: "no" to everything until `meeting_80_hours`, answer "yes", and expect the text "you're meeting it" plus the not-a-decision line.
  2. Pregnant path: expect "You may be exempt" and **no** "likely exempt" text anywhere on the page.
  3. Back after a result: answer "yes" to pregnant, tap Back, answer "no", and expect the next question (not the result).
  4. Reload on question 3 resumes at question 3.
  5. Spanish: pick Español, and expect "Sí" and the Spanish not-a-decision line on the result.
  6. `unsure` on question 1 leads to the ask-county result with a `tel:` link.
- [ ] **Step 5:** `npx playwright install chromium` (if the Node shim breaks npx, use `node node_modules/@playwright/test/cli.js install chromium`), then `npm run e2e`. Expected: 6 passed.
- [ ] **Step 6: screenshots.** Save 360px screenshots of the home, a question and each result type, in light and in dark, to `docs/screenshots/phase1/`. Look at them. Anything cut off, overlapping, or under 48px tap height is a defect.
- [ ] **Step 7: commit** `feat(screener): one-question-per-screen screener with e2e`

### Task 7: Installable PWA + deploy + budget check (deploy needs the user's OK)

**Files:** Create `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`; Modify `src/app/layout.tsx` (manifest link, `theme-color`)

- [ ] **Step 1:** Manifest: name "HourProof", `display: standalone`, `start_url: /`, light `background_color`, and a clock-ring-with-check icon (simple SVG rendered to PNG at 192 and 512).
- [ ] **Step 2: JS budget.** `npm run build` and read the per-route "First Load JS" in the log. Expected: `/` and `/screener` under 200 KB. Over budget → find the import with `ANALYZE` or by reading the build output, then fix it.
- [ ] **Step 3: ASK THE USER** before the first deploy. It creates a public URL under their Vercel account. After approval: `vercel link` then `vercel deploy` (a preview first), open it on a phone, and run the six e2e flows by hand.
- [ ] **Step 4: commit + phase gate report.** Write `docs/plans/phase1-gate.md` with the test counts (paste the real `vitest` and `playwright` summaries), the build exit code and route sizes, the preview URL, the screenshots, and the open items for Phase 2.

---

## Parallelism for agents
- Task 1 goes first, alone.
- Then **in parallel (separate worktrees, no shared files):** Task 2 → Task 3 (the engine depends on the schema, so one agent does both, in order) · Task 4 · Task 5.
- Task 6 after 3, 4 and 5 merge. Task 7 last.
- Each task gets a fresh reviewer agent that checks it against this plan and the Global Constraints before merge.
