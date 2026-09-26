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
  return {
    question: q ?? rule.question_en,
    proof: p ?? rule.proofThatHelps_en,
    questionFallback: lang === 'es' && !rule.question_es,
    proofFallback: lang === 'es' && !rule.proofThatHelps_es,
  }
}
