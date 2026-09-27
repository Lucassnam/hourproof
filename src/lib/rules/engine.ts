import type { Rule, RuleSet } from './schema'
import { californiaDate } from '../dates'

export type Answer = 'yes' | 'no' | 'unsure'
// Sentinel answer key for the "check any that apply" exemption checklist screen (v2). Its
// value records whether the user pressed Continue (some checked, or explicitly "none of
// these"), or "not sure" — see checklistAnswers.
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

// Moved to src/lib/dates.ts (shared with the hour tracker); re-exported here so existing
// `from './engine'` / `from '@/lib/rules/engine'` imports keep working.
export { californiaDate }

// Rules still in effect on `now`. A rule with `validUntil` applies through that date (inclusive)
// and is skipped afterwards, exactly as if it weren't in the list.
export function activeRules(set: RuleSet, now: Date = new Date()): readonly Rule[] {
  const today = californiaDate(now)
  return set.rules.filter((r) => r.validUntil === undefined || r.validUntil >= today)
}

// Groups all `scope` rules as individual leading questions, all `exemption` rules into a
// single checklist screen (with `continue`-outcome `info` rules folded in as passive notes,
// e.g. "veterans aren't automatically exempt"), and all other `info` rules as trailing
// individual questions (e.g. "ask the county", "meeting the 20h/week requirement already").
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

// Builds the Answers produced by submitting the checklist screen. `mode` is 'continue' (at
// least one box checked, or the user is done checking), 'none' ("none of these apply" was
// pressed), or 'unsure' ("not sure" was pressed). Every active exemption rule gets an
// explicit yes/no so `nextStep` can compute the checked list; unknown ids and an empty
// 'continue' (nothing checked, but the caller claims to be continuing) are programming errors.
export function checklistAnswers(
  set: RuleSet,
  checkedIds: readonly string[],
  mode: 'continue' | 'none' | 'unsure',
  now: Date = new Date(),
): Answers {
  const exemptions = activeRules(set, now).filter((r) => r.kind === 'exemption')
  const exemptionIds = new Set(exemptions.map((r) => r.id))
  for (const id of checkedIds) {
    if (!exemptionIds.has(id)) throw new Error(`checklistAnswers: unknown checklist id "${id}"`)
  }
  if (mode === 'continue' && checkedIds.length === 0) {
    throw new Error('checklistAnswers: "continue" requires at least one checked id (use "none" instead)')
  }
  const checklistValue: Answer = mode === 'unsure' ? 'unsure' : mode === 'continue' ? 'yes' : 'no'
  const out: Record<string, Answer> = { [CHECKLIST]: checklistValue }
  for (const rule of exemptions) out[rule.id] = checkedIds.includes(rule.id) ? 'yes' : 'no'
  return out
}

// Undoes exactly one screen of progress. For a pending question/checklist screen, this drops
// the answer belonging to the *previous* screen (so that screen re-appears). For a result, it
// drops the answer(s) of whichever screen actually decided it (the deciding rule for a
// question, or the checklist itself when the checklist decided it); for the terminal `subject`
// result, that's the last screen. Going back INTO the checklist (whether because it decided a
// result, or because it's the screen just before wherever we currently are) only clears the
// CHECKLIST sentinel — the individual exemption yes/no answers are kept so the UI can re-show
// the same boxes checked. Going back OUT of the checklist to an earlier screen drops it (and
// everything after it) entirely.
export function goBack(set: RuleSet, answers: Answers, now: Date = new Date()): Answers {
  const list = screens(set, now)
  const step = nextStep(set, answers, now)

  let dropIndex: number
  if (step.type === 'question' || step.type === 'checklist') {
    dropIndex = step.index - 1
  } else if (step.unsureAt !== null) {
    dropIndex = list.findIndex((s) => (s.type === 'question' ? s.rule.id === step.unsureAt : step.unsureAt === CHECKLIST))
  } else if (step.ruleIds.length > 0) {
    const id = step.ruleIds[0]
    dropIndex = list.findIndex((s) => (s.type === 'question' ? s.rule.id === id : s.rules.some((r) => r.id === id)))
  } else {
    dropIndex = list.length - 1
  }

  if (dropIndex < 0) return answers

  const keepIds = new Set<string>()
  for (let i = 0; i < dropIndex; i++) {
    const s = list[i]
    if (s.type === 'question') keepIds.add(s.rule.id)
    else {
      keepIds.add(CHECKLIST)
      for (const r of s.rules) keepIds.add(r.id)
    }
  }

  const result: Record<string, Answer> = {}
  for (const [k, v] of Object.entries(answers)) if (keepIds.has(k)) result[k] = v

  const dropScreen = list[dropIndex]
  if (dropScreen.type === 'checklist') {
    for (const r of dropScreen.rules) if (answers[r.id] !== undefined) result[r.id] = answers[r.id]
  }
  return result
}

export function displayOutcome(set: RuleSet, step: Extract<Step, { type: 'result' }>): DisplayOutcome {
  if (step.outcome !== 'likely_exempt') return step.outcome
  if (set.reviewedAt === null) return 'possibly_exempt'
  const hasConfirmed = step.ruleIds.some((id) => set.rules.find((r) => r.id === id)?.confidence === 'confirmed')
  return hasConfirmed ? 'likely_exempt' : 'possibly_exempt'
}

// Picks the rule's text in `lang`, falling back to English (and flagging it) when a Spanish
// text is missing. `hint` and `proof` are null when the rule has none in any language. `label`
// is the short checklist checkbox text (null for non-exemption rules, which have none).
export function ruleText(rule: Rule, lang: Lang) {
  const es = lang === 'es'
  const q = es ? rule.question_es : rule.question_en
  const h = es ? rule.hint_es : rule.hint_en
  const p = es ? rule.proofThatHelps_es : rule.proofThatHelps_en
  const l = es ? rule.label_es : rule.label_en
  return {
    question: q ?? rule.question_en,
    hint: h ?? rule.hint_en ?? null,
    proof: p ?? rule.proofThatHelps_en ?? null,
    label: l ?? rule.label_en ?? null,
    questionFallback: es && !rule.question_es,
    hintFallback: es && !!rule.hint_en && !rule.hint_es,
    proofFallback: es && !!rule.proofThatHelps_en && !rule.proofThatHelps_es,
    labelFallback: es && !!rule.label_en && !rule.label_es,
  }
}

// The county-script templates live here (not in messages/next-intl) so the engine stays
// usable without next-intl, e.g. from tests or a future non-web surface.
const COUNTY_SCRIPT_TEMPLATES: Record<Lang, { because: (labels: string) => string; unsure: string }> = {
  en: {
    because: (labels) => `I think I don't have to meet the CalFresh work rule because: ${labels}. Can you check my case?`,
    unsure: "I'm not sure if the CalFresh work rule applies to me. Can you check my case?",
  },
  es: {
    because: (labels) => `Creo que no tengo que cumplir la regla de trabajo de CalFresh porque: ${labels}. ¿Puede revisar mi caso?`,
    unsure: 'No estoy seguro/a de si la regla de trabajo de CalFresh me aplica. ¿Puede revisar mi caso?',
  },
}

// A ready-to-read script for the user to say to their county worker, or null when the outcome
// has none (e.g. not_subject, meeting_requirement, subject). Labels are joined with "; "; a
// missing label_es falls back to label_en (via ruleText).
export function countyScript(set: RuleSet, step: Extract<Step, { type: 'result' }>, lang: Lang): string | null {
  const t = COUNTY_SCRIPT_TEMPLATES[lang]
  if (step.outcome === 'ask_county') return t.unsure
  if (step.outcome !== 'likely_exempt') return null
  const labels = step.ruleIds
    .map((id) => set.rules.find((r) => r.id === id))
    .filter((r): r is Rule => !!r)
    .map((r) => ruleText(r, lang).label)
    .filter((l): l is string => !!l)
  if (labels.length === 0) return null
  return t.because(labels.join('; '))
}
