import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'
import { activeRules, californiaDate, displayOutcome, goBack, nextStep, ruleText, type Answers } from '../engine'

const r = (id: string, kind: string, outcomeIfYes: string, confidence = 'confirmed') => ({
  id, question_en: `${id}?`, question_es: id === 'age' ? '¿edad?' : null, kind, outcomeIfYes,
  proofThatHelps_en: 'proof', proofThatHelps_es: id === 'age' ? 'prueba' : null,
  label_en: kind === 'exemption' ? `${id} label` : undefined,
  sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence })
const set = (reviewedAt: string | null = null) => parseRuleSet({
  version: 't', reviewedAt, reviewer: reviewedAt ? 'Advocate' : null, generalSourceUrl: 'https://example.gov/g',
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

// A set with a time-limited rule between age and pregnant, like waived_county_scope in the real file.
const timed = () => parseRuleSet({
  version: 't', reviewedAt: null, reviewer: null, generalSourceUrl: 'https://example.gov/g',
  county: { name: 'SC', phone: '000', sourceUrl: 'https://example.gov' },
  rules: [r('age', 'scope', 'not_subject'), { ...r('waived', 'scope', 'not_subject'), validUntil: '2026-10-31' },
          r('pregnant', 'exemption', 'likely_exempt'), r('meeting', 'info', 'meeting_requirement')] })
// California dates: Oct 31 is still in effect all day long in Los Angeles.
const OCT31_NOON = new Date('2026-10-31T12:00:00-07:00')
const OCT31_LATE = new Date('2026-11-01T06:30:00Z') // 23:30 on Oct 31 in California (PDT)
const NOV1 = new Date('2026-11-01T09:00:00-07:00')

describe('validUntil', () => {
  test('californiaDate uses the California calendar date', () => {
    expect(californiaDate(OCT31_LATE)).toBe('2026-10-31')
    expect(californiaDate(NOV1)).toBe('2026-11-01')
  })
  test('the rule is asked on or before its date', () => {
    expect(nextStep(timed(), { age: 'no' }, OCT31_NOON)).toMatchObject({ type: 'question', rule: { id: 'waived' }, index: 1, total: 4 })
    expect(nextStep(timed(), { age: 'no' }, OCT31_LATE)).toMatchObject({ type: 'question', rule: { id: 'waived' } })
    expect(nextStep(timed(), { age: 'no', waived: 'yes' }, OCT31_NOON)).toMatchObject({ outcome: 'not_subject', ruleId: 'waived' })
  })
  test('the rule is skipped after its date, as if it were not in the list', () => {
    expect(activeRules(timed(), NOV1).map((x) => x.id)).toEqual(['age', 'pregnant', 'meeting'])
    expect(nextStep(timed(), { age: 'no' }, NOV1)).toMatchObject({ type: 'question', rule: { id: 'pregnant' }, index: 1, total: 3 })
  })
  test('a stale answer to a skipped rule is ignored', () =>
    expect(nextStep(timed(), { age: 'no', waived: 'yes' }, NOV1)).toMatchObject({ type: 'question', rule: { id: 'pregnant' } }))
  test('all-no after the date is subject without asking the skipped rule', () =>
    expect(nextStep(timed(), { age: 'no', pregnant: 'no', meeting: 'no' }, NOV1)).toEqual({ type: 'result', outcome: 'subject', ruleId: null }))
  test('goBack from the question after a skipped rule returns to the rule before it', () => {
    const back = goBack(timed(), { age: 'no' }, NOV1)
    expect(back).toEqual({})
    expect(nextStep(timed(), back, NOV1)).toMatchObject({ type: 'question', rule: { id: 'age' } })
  })
  test('goBack from a result across a skipped rule undoes the deciding answer', () => {
    const back = goBack(timed(), { age: 'no', pregnant: 'yes' }, NOV1)
    expect(back).toEqual({ age: 'no' })
    expect(nextStep(timed(), back, NOV1)).toMatchObject({ type: 'question', rule: { id: 'pregnant' } })
  })
  test('goBack two steps across a skipped rule', () => {
    const back = goBack(timed(), { age: 'no', pregnant: 'no' }, NOV1)
    expect(back).toEqual({ age: 'no' })
    expect(nextStep(timed(), back, NOV1)).toMatchObject({ type: 'question', rule: { id: 'pregnant' } })
  })
  test('goBack before the date still steps through the timed rule', () =>
    expect(goBack(timed(), { age: 'no', waived: 'no' }, OCT31_NOON)).toEqual({ age: 'no' }))
  test('goBack from the all-no result after the date drops the last active answer', () =>
    expect(goBack(timed(), { age: 'no', pregnant: 'no', meeting: 'no' }, NOV1)).toEqual({ age: 'no', pregnant: 'no' }))
})

describe('ruleText hints and absent proof', () => {
  const base = {
    id: 'vet', question_en: 'Vet?', question_es: '¿Vet?', kind: 'info', outcomeIfYes: 'continue',
    sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence: 'confirmed',
  } as const
  test('spanish hint when present', () =>
    expect(ruleText({ ...base, hint_en: 'hint', hint_es: 'pista' }, 'es')).toMatchObject({ hint: 'pista', hintFallback: false }))
  test('missing spanish hint falls back to english and flags it', () =>
    expect(ruleText({ ...base, hint_en: 'hint' }, 'es')).toMatchObject({ hint: 'hint', hintFallback: true }))
  test('no hint and no proof are null, never flagged', () =>
    expect(ruleText(base, 'es')).toMatchObject({ hint: null, proof: null, hintFallback: false, proofFallback: false }))
  test('english hint', () =>
    expect(ruleText({ ...base, hint_en: 'hint', hint_es: 'pista' }, 'en')).toMatchObject({ hint: 'hint', hintFallback: false }))
})
