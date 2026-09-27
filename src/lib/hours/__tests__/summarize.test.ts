import { describe, expect, test } from 'vitest'
import { summarizeMonth, validateEntry } from '../summarize'
import type { Entry } from '../types'

let n = 0
const e = (date: string, type: Entry['type'], hours: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `e${n++}`, date, type, hours, createdAt: '2026-10-01T00:00:00Z', ...over })

describe('summarizeMonth', () => {
  test('sums work, volunteer and program together', () => {
    const s = summarizeMonth([e('2026-10-02', 'work', 30), e('2026-10-03', 'volunteer', 20), e('2026-10-04', 'program', 10)], '2026-10', '2026-10-15')
    expect(s.counted).toBe(60)
    expect(s.remaining).toBe(20)
  })
  test('only counts entries in the month (31st belongs to its own month)', () => {
    const s = summarizeMonth([e('2026-10-31', 'work', 8), e('2026-11-01', 'work', 8)], '2026-10', '2026-10-31')
    expect(s.counted).toBe(8)
  })
  test('quarter hours add exactly to 80 and meet the rule', () => {
    const entries = [e('2026-10-01', 'work', 79.75), e('2026-10-02', 'work', 0.25)]
    const s = summarizeMonth(entries, '2026-10', '2026-10-20')
    expect(s.counted).toBe(80)
    expect(s.status).toBe('met')
    expect(s.neededPerDay).toBeNull()
  })
  test('job search outside a program is not counted and is flagged', () => {
    const s = summarizeMonth([e('2026-10-02', 'work', 10), e('2026-10-03', 'job_search', 5)], '2026-10', '2026-10-10')
    expect(s.counted).toBe(10)
    expect(s.flags).toContain('job_search_outside_program')
  })
  test('job search in a program counts only while under the program hours', () => {
    const s = summarizeMonth([e('2026-10-02', 'program', 10), e('2026-10-03', 'job_search', 12, { inProgram: true })], '2026-10', '2026-10-10')
    expect(s.jobSearchCounted).toBe(9.75)
    expect(s.counted).toBe(19.75)
    expect(s.flags).toContain('job_search_capped')
  })
  test('job search in a program with no program hours counts nothing', () => {
    const s = summarizeMonth([e('2026-10-03', 'job_search', 5, { inProgram: true })], '2026-10', '2026-10-10')
    expect(s.jobSearchCounted).toBe(0)
  })
  test('workfare is not counted and is flagged when mixed', () => {
    const s = summarizeMonth([e('2026-10-02', 'workfare', 20), e('2026-10-03', 'work', 10)], '2026-10', '2026-10-10')
    expect(s.counted).toBe(10)
    expect(s.byType.workfare).toBe(20)
    expect(s.flags).toContain('workfare_mixed')
  })
  test('pace: on track vs behind, with hours needed per day', () => {
    const on = summarizeMonth([e('2026-10-01', 'work', 30)], '2026-10', '2026-10-10')
    expect(on.status).toBe('on_track') // 30/10*31 = 93
    const behind = summarizeMonth([e('2026-10-01', 'work', 20)], '2026-10', '2026-10-20')
    expect(behind.status).toBe('behind')
    expect(behind.flags).toContain('behind_pace')
    expect(behind.neededPerDay).toBeCloseTo(60 / 11, 2)
  })
  test('empty current month is not_started; future month is future; past month under 80 is behind', () => {
    expect(summarizeMonth([], '2026-10', '2026-10-05').status).toBe('not_started')
    expect(summarizeMonth([], '2026-11', '2026-10-05').status).toBe('future')
    const past = summarizeMonth([e('2026-09-10', 'work', 40)], '2026-09', '2026-10-05')
    expect(past).toMatchObject({ status: 'behind', daysLeft: 0, neededPerDay: null })
  })
})

describe('validateEntry', () => {
  test('rejects bad hours', () => {
    expect(validateEntry(e('2026-10-01', 'work', 0), [])).toContain('bad_hours')
    expect(validateEntry(e('2026-10-01', 'work', 1.1), [])).toContain('bad_hours')
    expect(validateEntry(e('2026-10-01', 'work', 25), [])).toContain('bad_hours')
  })
  test('rejects more than 24 hours in a day across entries', () =>
    expect(validateEntry(e('2026-10-01', 'work', 10), [e('2026-10-01', 'volunteer', 15)])).toContain('too_many_hours_that_day'))
  test('rejects impossible dates', () => expect(validateEntry(e('2026-02-30', 'work', 1), [])).toContain('bad_date'))
  test('inProgram only for job search', () =>
    expect(validateEntry(e('2026-10-01', 'work', 1, { inProgram: true }), [])).toContain('in_program_only_for_job_search'))
  test('a good entry has no errors', () => expect(validateEntry(e('2026-10-01', 'volunteer', 3.5), [])).toEqual([]))
})
