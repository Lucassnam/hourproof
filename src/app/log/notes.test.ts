import { describe, expect, test } from 'vitest'
import { summarizeMonth } from '@/lib/hours/summarize'
import type { Entry } from '@/lib/hours/types'
import { notesFor } from './notes'

const entry = (date: string, type: Entry['type'], hours: number, extra: Partial<Entry> = {}): Entry => ({
  id: `${date}-${type}-${hours}`,
  date,
  type,
  hours,
  createdAt: `${date}T12:00:00.000Z`,
  ...extra,
})

describe('log notes', () => {
  test('behind_pace waits until day 7 of the month', () => {
    const entries = [entry('2026-09-01', 'work', 1)]
    for (const [today, shown] of [
      ['2026-09-03', false],
      ['2026-09-06', false],
      ['2026-09-07', true],
      ['2026-09-20', true],
    ] as const) {
      const summary = summarizeMonth(entries, '2026-09', today)
      expect(summary.status, today).toBe('behind')
      expect(notesFor(summary, false, entries.length).includes('behind_pace'), today).toBe(shown)
    }
  })

  test('behind_pace never shows when on track or met', () => {
    const onTrack = summarizeMonth([entry('2026-09-09', 'work', 15), entry('2026-09-10', 'work', 15)], '2026-09', '2026-09-10')
    expect(onTrack.status).toBe('on_track')
    expect(notesFor(onTrack, false, 1)).not.toContain('behind_pace')
  })

  test('an empty past month shows no behind note; a past month with hours does', () => {
    const empty = summarizeMonth([], '2026-08', '2026-09-26')
    expect(notesFor(empty, true, 0)).toEqual([])
    const some = summarizeMonth([entry('2026-08-10', 'work', 20)], '2026-08', '2026-09-26')
    expect(notesFor(some, true, 1)).toContain('behind_pace')
  })

  test('workfare alone gets the workfare_only note; mixed gets workfare_mixed only', () => {
    const only = summarizeMonth([entry('2026-09-02', 'workfare', 10)], '2026-09', '2026-09-26')
    expect(notesFor(only, false, 1)).toContain('workfare_only')
    expect(notesFor(only, false, 1)).not.toContain('workfare_mixed')
    const mixed = summarizeMonth(
      [entry('2026-09-02', 'workfare', 10), entry('2026-09-03', 'work', 10)],
      '2026-09',
      '2026-09-26',
    )
    expect(notesFor(mixed, false, 2)).toContain('workfare_mixed')
    expect(notesFor(mixed, false, 2)).not.toContain('workfare_only')
  })

  test('job search outside a program gets its note', () => {
    const s = summarizeMonth([entry('2026-09-02', 'job_search', 3, { inProgram: false })], '2026-09', '2026-09-26')
    expect(notesFor(s, false, 1)).toContain('job_search_outside_program')
  })
})
