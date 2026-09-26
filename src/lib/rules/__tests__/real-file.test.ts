import { describe, expect, test } from 'vitest'
import { ruleSet } from '../load'

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
