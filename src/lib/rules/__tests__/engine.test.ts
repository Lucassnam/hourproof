import { describe, expect, test } from 'vitest'
import { parseRuleSet } from '../schema'
import { CHECKLIST, checklistAnswers, countyScript, displayOutcome, goBack, nextStep, ruleText, screens, type Answers } from '../engine'

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
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), ['pregnant', 'shaky'], 'continue') })).toMatchObject({ outcome: 'likely_exempt', ruleIds: ['pregnant', 'shaky'] }))
  test('none of these continues to the next question', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), [], 'none') })).toMatchObject({ type: 'question', rule: { id: 'unfit' } }))
  test('not sure with nothing checked asks the county', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), [], 'unsure') })).toMatchObject({ outcome: 'ask_county', unsureAt: CHECKLIST, ruleIds: [] }))
  test('not sure with something checked still reports the checked items', () =>
    expect(nextStep(set(), { age: 'no', ...checklistAnswers(set(), ['pregnant'], 'unsure') })).toMatchObject({ outcome: 'likely_exempt', ruleIds: ['pregnant'] }))
  test('unsure on the 20-hours question asks the county, never meeting_requirement', () =>
    expect(nextStep(set(), { ...pastChecklist, unfit: 'no', meeting: 'unsure' })).toMatchObject({ outcome: 'ask_county', unsureAt: 'meeting' }))
  test('unsure on a scope question gives ask_county with unsureAt set to that rule', () =>
    expect(nextStep(set(), { age: 'unsure' })).toEqual({ type: 'result', outcome: 'ask_county', ruleIds: [], unsureAt: 'age' }))
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
  test('non-exempt outcomes pass through unchanged', () => {
    expect(displayOutcome(set(), { type: 'result', outcome: 'not_subject', ruleIds: [], unsureAt: null })).toBe('not_subject')
    expect(displayOutcome(set(), { type: 'result', outcome: 'meeting_requirement', ruleIds: [], unsureAt: null })).toBe('meeting_requirement')
    expect(displayOutcome(set(), { type: 'result', outcome: 'ask_county', ruleIds: [], unsureAt: null })).toBe('ask_county')
    expect(displayOutcome(set(), { type: 'result', outcome: 'subject', ruleIds: [], unsureAt: null })).toBe('subject')
  })
})

describe('ruleText', () => {
  // A rule with every field present in both languages, so the "all flags false" case is
  // unambiguous.
  const full = {
    id: 'full', question_en: 'full?', question_es: '¿full?', kind: 'exemption', outcomeIfYes: 'likely_exempt',
    hint_en: 'hint', hint_es: 'pista', proofThatHelps_en: 'proof', proofThatHelps_es: 'prueba',
    label_en: 'Full label', label_es: 'Etiqueta completa',
    sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence: 'confirmed',
  } as const

  test('spanish when present, all flags false', () =>
    expect(ruleText(full, 'es')).toMatchObject({
      question: '¿full?', hint: 'pista', proof: 'prueba', label: 'Etiqueta completa',
      questionFallback: false, hintFallback: false, proofFallback: false, labelFallback: false,
    }))
  test('falls back to english and flags it', () =>
    expect(ruleText({ ...full, question_es: null }, 'es')).toMatchObject({ question: 'full?', questionFallback: true }))
  test('spanish question, english proof', () =>
    expect(ruleText({ ...full, proofThatHelps_es: null }, 'es')).toMatchObject({ questionFallback: false, proofFallback: true }))
  test('english never flags', () =>
    expect(ruleText(full, 'en')).toMatchObject({
      questionFallback: false, hintFallback: false, proofFallback: false, labelFallback: false,
    }))
})

describe('ruleText checklistNote', () => {
  const noteRule = {
    id: 'vet', question_en: 'Vet?', question_es: '¿Vet?', kind: 'info' as const, outcomeIfYes: 'continue' as const,
    hint_en: 'hint', hint_es: 'pista', sourceUrl: 'https://example.gov/a', sourceQuote: 'q', confidence: 'confirmed' as const,
  }
  test('null when the rule has none', () =>
    expect(ruleText(noteRule, 'es')).toMatchObject({ checklistNote: null, checklistNoteFallback: false }))
  test('Spanish note when present', () =>
    expect(ruleText({ ...noteRule, checklistNote_en: 'note', checklistNote_es: 'nota' }, 'es')).toMatchObject({
      checklistNote: 'nota', checklistNoteFallback: false }))
  test('falls back to English and flags it', () =>
    expect(ruleText({ ...noteRule, checklistNote_en: 'note' }, 'es')).toMatchObject({ checklistNote: 'note', checklistNoteFallback: true }))
  test('English', () =>
    expect(ruleText({ ...noteRule, checklistNote_en: 'note', checklistNote_es: 'nota' }, 'en')).toMatchObject({
      checklistNote: 'note', checklistNoteFallback: false }))
})

describe('ruleText hints and absent proof', () => {
  const base2 = {
    id: 'vet', question_en: 'Vet?', question_es: '¿Vet?', kind: 'info', outcomeIfYes: 'continue',
    sourceUrl: 'https://example.gov', sourceQuote: 'q', confidence: 'confirmed',
  } as const
  test('spanish hint when present', () =>
    expect(ruleText({ ...base2, hint_en: 'hint', hint_es: 'pista' }, 'es')).toMatchObject({ hint: 'pista', hintFallback: false }))
  test('missing spanish hint falls back to english and flags it', () =>
    expect(ruleText({ ...base2, hint_en: 'hint' }, 'es')).toMatchObject({ hint: 'hint', hintFallback: true }))
  test('no hint and no proof are null, never flagged', () =>
    expect(ruleText(base2, 'es')).toMatchObject({ hint: null, proof: null, hintFallback: false, proofFallback: false }))
  test('english hint', () =>
    expect(ruleText({ ...base2, hint_en: 'hint', hint_es: 'pista' }, 'en')).toMatchObject({ hint: 'hint', hintFallback: false }))
})

describe('ruleText labels', () => {
  test('missing spanish label falls back to english and flags it (shaky)', () =>
    expect(ruleText(set().rules[2], 'es')).toMatchObject({ label: 'Shaky reason', labelFallback: true }))
  test('spanish label when present (pregnant)', () =>
    expect(ruleText(set().rules[1], 'es')).toMatchObject({ label: 'Estoy embarazada', labelFallback: false }))
  test('a non-exemption rule has no label', () =>
    expect(ruleText(set().rules[0], 'es')).toMatchObject({ label: null, labelFallback: false }))
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
  const s = set(null, [])
  const withWaiver = parseRuleSet({ ...s, rules: [s.rules[0], expiring, ...s.rules.slice(1)] })
  // California dates: Oct 31 is still in effect all day in Los Angeles; Nov 1 is not.
  const OCT31 = new Date('2026-10-31T20:00:00Z')
  const NOV1 = new Date('2026-11-01T20:00:00Z')

  test('asked on the last day, skipped the day after', () => {
    expect(nextStep(withWaiver, { age: 'no' }, OCT31)).toMatchObject({ type: 'question', rule: { id: 'waiver' } })
    expect(nextStep(withWaiver, { age: 'no' }, NOV1)).toMatchObject({ type: 'checklist' })
  })

  test('a stale "yes" on the expired waiver is ignored; the flow continues to the checklist, not not_subject', () =>
    expect(nextStep(withWaiver, { age: 'no', waiver: 'yes' }, NOV1)).toMatchObject({ type: 'checklist' }))

  test('goBack from the checklist after the date returns to age, skipping the expired waiver', () => {
    const back = goBack(withWaiver, { age: 'no' }, NOV1)
    expect(nextStep(withWaiver, back, NOV1)).toMatchObject({ type: 'question', rule: { id: 'age' } })
  })

  test('goBack from a result across the expired waiver undoes the deciding answer', () => {
    const a = { age: 'no', ...checklistAnswers(withWaiver, ['pregnant'], 'continue', NOV1) } as Answers
    expect(nextStep(withWaiver, a, NOV1)).toMatchObject({ outcome: 'likely_exempt', ruleIds: ['pregnant'] })
    const back = goBack(withWaiver, a, NOV1)
    expect(back).toMatchObject({ age: 'no', pregnant: 'yes' })
    expect(back).not.toHaveProperty(CHECKLIST)
    expect(nextStep(withWaiver, back, NOV1)).toMatchObject({ type: 'checklist' })
  })

  test('before the date, goBack from the checklist returns to the waiver question', () => {
    const back = goBack(withWaiver, { age: 'no', waiver: 'no' }, OCT31)
    expect(nextStep(withWaiver, back, OCT31)).toMatchObject({ type: 'question', rule: { id: 'waiver' } })
  })
})
