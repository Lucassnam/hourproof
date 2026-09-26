import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'
import { displayOutcome, goBack, nextStep, ruleText, type Answers } from '../engine'

const r = (id: string, kind: string, outcomeIfYes: string, confidence = 'confirmed') => ({
  id, question_en: `${id}?`, question_es: id === 'age' ? '¿edad?' : null, kind, outcomeIfYes,
  proofThatHelps_en: 'proof', proofThatHelps_es: id === 'age' ? 'prueba' : null,
  sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence })
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
  test('spanish when present', () =>
    expect(ruleText(set().rules[0], 'es')).toMatchObject({
      question: '¿edad?', proof: 'prueba', questionFallback: false, proofFallback: false,
    }))
  test('falls back to english and flags it', () =>
    expect(ruleText(set().rules[1], 'es')).toMatchObject({
      question: 'pregnant?', questionFallback: true, proofFallback: true,
    }))
  test('spanish question, english proof', () => {
    const rule = {
      id: 'mixed', question_en: 'mixed?', question_es: '¿mixed?', kind: 'exemption', outcomeIfYes: 'likely_exempt',
      proofThatHelps_en: 'proof', proofThatHelps_es: null, sourceUrl: 'https://example.gov', sourceQuote: 'q',
      confidence: 'confirmed',
    } as const
    expect(ruleText(rule, 'es')).toMatchObject({ questionFallback: false, proofFallback: true })
  })
  test('english never flags', () =>
    expect(ruleText(set().rules[1], 'en')).toMatchObject({ questionFallback: false, proofFallback: false }))
})
