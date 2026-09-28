import { describe, expect, test } from 'vitest'
import { summarizeMonth } from '@/lib/hours/summarize'
import type { Entry } from '@/lib/hours/types'
import { doesNotCount, mayCountPartly, notesFor } from './notes'

const entry = (date: string, type: Entry['type'], hours: number, extra: Partial<Entry> = {}): Entry => ({
  id: `${date}-${type}-${hours}`,
  date,
  type,
  hours,
  createdAt: `${date}T12:00:00.000Z`,
  ...extra,
})

describe('log notes', () => {
  test('behind_pace is never a note, even when the engine flags it (current or past month)', () => {
    const current = summarizeMonth([entry('2026-09-01', 'work', 1)], '2026-09', '2026-09-20')
    expect(current.status).toBe('behind')
    expect(current.flags).toContain('behind_pace')
    expect(notesFor(current)).toEqual([])
    const past = summarizeMonth([entry('2026-08-10', 'work', 20)], '2026-08', '2026-09-26')
    expect(past.flags).toContain('behind_pace')
    expect(notesFor(past)).toEqual([])
  })

  test('workfare alone gets the workfare_only note; mixed gets workfare_mixed only', () => {
    const only = summarizeMonth([entry('2026-09-02', 'workfare', 10)], '2026-09', '2026-09-26')
    expect(notesFor(only)).toEqual(['workfare_only'])
    const mixed = summarizeMonth(
      [entry('2026-09-02', 'workfare', 10), entry('2026-09-03', 'work', 10)],
      '2026-09',
      '2026-09-26',
    )
    expect(notesFor(mixed)).toEqual(['workfare_mixed'])
  })

  test('job search outside a program gets its note', () => {
    const s = summarizeMonth([entry('2026-09-02', 'job_search', 3, { inProgram: false })], '2026-09', '2026-09-26')
    expect(notesFor(s)).toEqual(['job_search_outside_program'])
  })

  test('capped in-program job search: the note, and "May count partly" only on in-program job-search rows', () => {
    const program = entry('2026-09-02', 'program', 4)
    const inProgram = entry('2026-09-03', 'job_search', 5, { inProgram: true })
    const outside = entry('2026-09-04', 'job_search', 1, { inProgram: false })
    const capped = summarizeMonth([program, inProgram, outside], '2026-09', '2026-09-26')
    expect(capped.flags).toContain('job_search_capped')
    expect(notesFor(capped)).toContain('job_search_capped')
    expect(mayCountPartly(capped, inProgram)).toBe(true)
    expect(mayCountPartly(capped, outside)).toBe(false)
    expect(mayCountPartly(capped, program)).toBe(false)

    const notCapped = summarizeMonth([entry('2026-09-02', 'program', 10), inProgram], '2026-09', '2026-09-26')
    expect(notCapped.flags).not.toContain('job_search_capped')
    expect(mayCountPartly(notCapped, inProgram)).toBe(false)
  })

  test("in-program job search with 0 program hours: its own note, \"Doesn't count\" tag, never \"May count partly\"", () => {
    const inProgram = entry("2026-09-03", "job_search", 5, { inProgram: true })
    const work = entry("2026-09-02", "work", 6)
    const s = summarizeMonth([work, inProgram], "2026-09", "2026-09-26")
    expect(notesFor(s)).toEqual(["job_search_no_program"])
    expect(doesNotCount(s, inProgram)).toBe(true)
    expect(mayCountPartly(s, inProgram)).toBe(false)
    expect(doesNotCount(s, work)).toBe(false)
  })

  test("\"Doesn't count\": job search outside a program always; in-program only when there are no program hours", () => {
    const outside = entry("2026-09-04", "job_search", 1, { inProgram: false })
    const inProgram = entry("2026-09-03", "job_search", 5, { inProgram: true })
    const withProgram = summarizeMonth([entry("2026-09-02", "program", 4), inProgram, outside], "2026-09", "2026-09-26")
    expect(doesNotCount(withProgram, outside)).toBe(true)
    expect(doesNotCount(withProgram, inProgram)).toBe(false)
    expect(mayCountPartly(withProgram, inProgram)).toBe(true)
  })
})
