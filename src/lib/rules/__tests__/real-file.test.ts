import { describe, expect, test } from 'vitest'
import { ruleSet } from '../load'
import { displayOutcome, nextStep, type Answers } from '../engine'

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
