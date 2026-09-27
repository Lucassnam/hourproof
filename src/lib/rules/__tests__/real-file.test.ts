import { describe, expect, test } from 'vitest'
import { ruleSet } from '../load'
import { checklistAnswers, displayOutcome, nextStep, ruleText, screens, type Answers } from '../engine'

describe('shipped rule file', () => {
  test('parses and has at least 18 rules', () => {
    expect(ruleSet.rules.length).toBeGreaterThanOrEqual(18)
  })

  test('contains the required ids', () => {
    const ids = ruleSet.rules.map((r) => r.id)
    for (const id of [
      'child_under_14_calfresh_household',
      'care_child_under_6',
      'work_30h_or_217_50',
      'school_half_time',
      'meeting_80_hours',
    ]) {
      expect(ids).toContain(id)
    }
  })

  test('meeting_80_hours outcome is meeting_requirement, never likely_exempt', () => {
    const rule = ruleSet.rules.find((r) => r.id === 'meeting_80_hours')
    expect(rule).toBeDefined()
    expect(rule?.outcomeIfYes).toBe('meeting_requirement')
    expect(rule?.outcomeIfYes).not.toBe('likely_exempt')
  })

  test('every sourceUrl starts with https://', () => {
    for (const rule of ruleSet.rules) {
      expect(rule.sourceUrl.startsWith('https://')).toBe(true)
    }
  })
})

describe('shipped rule file: checklist labels', () => {
  const exemptionRules = ruleSet.rules.filter((r) => r.kind === 'exemption')

  test('the file actually has exemption rules to check (test is not vacuous)', () => {
    expect(exemptionRules.length).toBeGreaterThanOrEqual(13)
  })

  for (const rule of exemptionRules) {
    test(`${rule.id}: has label_en and label_es`, () => {
      expect(rule.label_en, `${rule.id}.label_en`).toBeTruthy()
      expect(rule.label_es, `${rule.id}.label_es`).toBeTruthy()
    })

    test(`${rule.id}: label_en is at most 56 characters`, () => {
      expect(rule.label_en!.length, `${rule.id}.label_en: "${rule.label_en}"`).toBeLessThanOrEqual(56)
    })

    test(`${rule.id}: labels never say exempt/exento`, () => {
      expect(rule.label_en).not.toMatch(/exempt/i)
      expect(rule.label_es).not.toMatch(/exent/i)
    })
  }
})

describe('shipped rule file: veteran checklist note', () => {
  const veteran = ruleSet.rules.find((r) => r.id === 'veteran_info')
  const disability = ruleSet.rules.find((r) => r.id === 'disability_benefits')

  test('the veteran note appears on the checklist screen with a checklist-specific note', () => {
    const checklist = screens(ruleSet, new Date('2026-10-01T19:00:00Z')).find((s) => s.type === 'checklist')
    expect(checklist && checklist.type === 'checklist' ? checklist.notes.map((r) => r.id) : []).toContain('veteran_info')
    expect(veteran?.checklistNote_en).toBeTruthy()
    expect(veteran?.checklistNote_es).toBeTruthy()
  })

  // The note tells people which box to check, by its exact label. If that label is ever
  // reworded, this fails so the note gets updated with it.
  test('the English note quotes the disability rule\'s current label_en', () => {
    expect(veteran?.checklistNote_en).toContain(`"${disability?.label_en}"`)
  })
  test('the Spanish note quotes the disability rule\'s current label_es', () => {
    expect(veteran?.checklistNote_es).toContain(`"${disability?.label_es}"`)
  })
  test('the checklist note never says "go back" (the box is on the same screen)', () => {
    expect(veteran?.checklistNote_en).not.toMatch(/go back/i)
    expect(veteran?.checklistNote_es).not.toMatch(/regrese/i)
  })
  test('ruleText picks the checklist note per language', () => {
    expect(ruleText(veteran!, 'en')).toMatchObject({ checklistNote: veteran!.checklistNote_en, checklistNoteFallback: false })
    expect(ruleText(veteran!, 'es')).toMatchObject({ checklistNote: veteran!.checklistNote_es, checklistNoteFallback: false })
  })
})

describe('shipped rule file: safety gate (unreviewed file must never claim likely_exempt)', () => {
  // Fixed instant so the waiver-county scope rule (validUntil 2026-10-31) is active and the
  // screen/rule counts below are deterministic.
  const NOW = new Date('2026-10-01T19:00:00Z')
  const scopeRules = ruleSet.rules.filter((r) => r.kind === 'scope')
  const exemptionRules = ruleSet.rules.filter((r) => r.kind === 'exemption')
  const noToScope: Answers = Object.fromEntries(scopeRules.map((r) => [r.id, 'no'] as const))

  test('the file actually has exemption rules to check (test is not vacuous)', () => {
    expect(exemptionRules.length).toBeGreaterThan(0)
  })

  for (const rule of exemptionRules) {
    test(`${rule.id}: checked alone through the checklist shows possibly_exempt, never likely_exempt display`, () => {
      const answers: Answers = { ...noToScope, ...checklistAnswers(ruleSet, [rule.id], 'continue', NOW) }
      const step = nextStep(ruleSet, answers, NOW)
      expect(step).toMatchObject({ type: 'result', outcome: 'likely_exempt', ruleIds: [rule.id] })
      expect(displayOutcome(ruleSet, step as Extract<typeof step, { type: 'result' }>)).toBe('possibly_exempt')
    })
  }

  test('all exemption rules checked at once still shows possibly_exempt, never likely_exempt display', () => {
    const allIds = exemptionRules.map((r) => r.id)
    const answers: Answers = { ...noToScope, ...checklistAnswers(ruleSet, allIds, 'continue', NOW) }
    const step = nextStep(ruleSet, answers, NOW)
    expect(step).toMatchObject({ type: 'result', outcome: 'likely_exempt' })
    expect((step as Extract<typeof step, { type: 'result' }>).ruleIds).toEqual(allIds)
    expect(displayOutcome(ruleSet, step as Extract<typeof step, { type: 'result' }>)).toBe('possibly_exempt')
  })

  test('the checklist screen count drops by one once the county waiver expires (Nov 1, 2026)', () => {
    const before = screens(ruleSet, NOW).length
    const after = screens(ruleSet, new Date('2026-11-02T19:00:00Z')).length
    expect(after).toBe(before - 1)
  })
})

describe('shipped rule file: Spanish texts are complete (no English fallback in the Spanish screener)', () => {
  for (const rule of ruleSet.rules) {
    test(`${rule.id}: question_es, proofThatHelps_es and hint_es are present where English exists`, () => {
      expect(rule.question_es, `${rule.id}.question_es`).toBeTruthy()
      if (rule.proofThatHelps_en) expect(rule.proofThatHelps_es, `${rule.id}.proofThatHelps_es`).toBeTruthy()
      if (rule.hint_en) expect(rule.hint_es, `${rule.id}.hint_es`).toBeTruthy()
      const t = ruleText(rule, 'es')
      expect(t.questionFallback || t.hintFallback || t.proofFallback).toBe(false)
    })
  }
})

describe('shipped rule file: time limits and sources', () => {
  test('waived_county_scope ends 2026-10-31, and its own sourceQuote says so', () => {
    const rule = ruleSet.rules.find((r) => r.id === 'waived_county_scope')
    expect(rule?.validUntil).toBe('2026-10-31')
    expect(rule?.sourceQuote).toContain('through October 31, 2026')
  })

  test('waived_county_scope is asked through Oct 31, 2026 and skipped from Nov 1, 2026 (California time)', () => {
    const answers: Answers = { age_scope: 'no' }
    expect(nextStep(ruleSet, answers, new Date('2026-10-31T23:30:00-07:00'))).toMatchObject({
      type: 'question', rule: { id: 'waived_county_scope' },
    })
    // Once the waiver rule drops out, age_scope: 'no' falls straight through to the checklist
    // (child_under_14_calfresh_household is an exemption now, not a standalone question).
    expect(nextStep(ruleSet, answers, new Date('2026-11-01T00:30:00-07:00'))).toMatchObject({
      type: 'checklist',
    })
  })

  test('only waived_county_scope is time-limited', () =>
    expect(ruleSet.rules.filter((r) => r.validUntil).map((r) => r.id)).toEqual(['waived_county_scope']))

  test('generalSourceUrl is the CDSS ACL 26-29 letter the rules cite', () => {
    expect(ruleSet.generalSourceUrl).toBe(
      'https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2026/26-29.pdf',
    )
    expect(ruleSet.rules.some((r) => r.sourceUrl === ruleSet.generalSourceUrl)).toBe(true)
  })

  test('a continue-outcome rule never needs result-screen proof; its guidance lives in the hint', () => {
    const vet = ruleSet.rules.find((r) => r.id === 'veteran_info')
    expect(vet?.outcomeIfYes).toBe('continue')
    expect(vet?.hint_en).toContain('go back and answer yes')
  })
})
