import type { Rule, RuleSet } from './schema'
import { californiaDate } from '../dates'

export type Answer = 'yes' | 'no' | 'unsure'
export type Answers = Readonly<Record<string, Answer>>
export type FinalOutcome = 'not_subject' | 'likely_exempt' | 'meeting_requirement' | 'ask_county' | 'subject'
export type Step =
  | { type: 'question'; rule: Rule; index: number; total: number }
  | { type: 'result'; outcome: FinalOutcome; ruleId: string | null }
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

export function nextStep(set: RuleSet, answers: Answers, now: Date = new Date()): Step {
  const rules = activeRules(set, now)
  const total = rules.length
  for (let index = 0; index < total; index++) {
    const rule = rules[index]
    const answer = answers[rule.id]
    if (answer === undefined) return { type: 'question', rule, index, total }
    if (answer === 'unsure') return { type: 'result', outcome: 'ask_county', ruleId: rule.id }
    if (answer === 'yes' && rule.outcomeIfYes !== 'continue')
      return { type: 'result', outcome: rule.outcomeIfYes, ruleId: rule.id }
  }
  return { type: 'result', outcome: 'subject', ruleId: null }
}

export function goBack(set: RuleSet, answers: Answers, now: Date = new Date()): Answers {
  const rules = activeRules(set, now)
  const step = nextStep(set, answers, now)
  const dropId =
    step.type === 'question'
      ? rules[step.index - 1]?.id
      : step.ruleId ?? rules[rules.length - 1]?.id
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

// Picks the rule's text in `lang`, falling back to English (and flagging it) when a Spanish
// text is missing. `hint` and `proof` are null when the rule has none in any language.
export function ruleText(rule: Rule, lang: Lang) {
  const es = lang === 'es'
  const q = es ? rule.question_es : rule.question_en
  const h = es ? rule.hint_es : rule.hint_en
  const p = es ? rule.proofThatHelps_es : rule.proofThatHelps_en
  return {
    question: q ?? rule.question_en,
    hint: h ?? rule.hint_en ?? null,
    proof: p ?? rule.proofThatHelps_en ?? null,
    questionFallback: es && !rule.question_es,
    hintFallback: es && !!rule.hint_en && !rule.hint_es,
    proofFallback: es && !!rule.proofThatHelps_en && !rule.proofThatHelps_es,
  }
}
