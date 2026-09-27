import { describe, expect, test } from 'vitest'
import { ruleSet } from '../load'
import { displayOutcome, nextStep, ruleText, type Answers } from '../engine'

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

describe('shipped rule file: safety gate (unreviewed file must never claim likely_exempt)', () => {
  const likelyExemptRules = ruleSet.rules.filter((r) => r.outcomeIfYes === 'likely_exempt')

  test('the file actually has likely_exempt rules to check (test is not vacuous)', () => {
    expect(likelyExemptRules.length).toBeGreaterThan(0)
  })

  for (const rule of likelyExemptRules) {
    test(`${rule.id}: unreviewed file shows possibly_exempt, never likely_exempt`, () => {
      const index = ruleSet.rules.findIndex((r) => r.id === rule.id)
      const answers: Answers = Object.fromEntries([
        ...ruleSet.rules.slice(0, index).map((r) => [r.id, 'no'] as const),
        [rule.id, 'yes'] as const,
      ])
      const step = nextStep(ruleSet, answers)
      expect(step).toMatchObject({ type: 'result', outcome: 'likely_exempt', ruleId: rule.id })
      expect(displayOutcome(ruleSet, step as Extract<typeof step, { type: 'result' }>)).toBe('possibly_exempt')
    })
  }
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
      type: 'question', rule: { id: 'waived_county_scope' }, total: ruleSet.rules.length,
    })
    expect(nextStep(ruleSet, answers, new Date('2026-11-01T00:30:00-07:00'))).toMatchObject({
      type: 'question', rule: { id: 'child_under_14_calfresh_household' }, total: ruleSet.rules.length - 1,
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
