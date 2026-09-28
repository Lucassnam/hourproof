import { describe, expect, test } from 'vitest'
import { mergeMonth, shiftsToEntries } from '../merge'
import { summarizeMonth } from '../summarize'
import type { Entry } from '../types'
import type { Shift } from '@/lib/shifts/types'

const shift = (over: Partial<Shift> = {}): Shift => ({
  id: 's1',
  kitchenId: 'k1',
  kitchenName: 'Community Kitchen',
  checkIn: '2026-10-05T09:00:00-07:00',
  checkOut: '2026-10-05T12:00:00-07:00',
  status: 'confirmed',
  confirmedBy: 'Supervisor Sam',
  reason: null,
  autoClosed: false,
  ...over,
})

let n = 0
const e = (date: string, type: Entry['type'], hours: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `e${n++}`, date, type, hours, createdAt: '2026-10-01T00:00:00Z', ...over })

describe('shiftsToEntries', () => {
  test('a confirmed shift becomes an Entry with source shift, verification confirmed, type volunteer, right date and hours', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const [entry] = shiftsToEntries([shift()], now)
    expect(entry).toMatchObject({
      source: 'shift',
      verification: 'confirmed',
      type: 'volunteer',
      date: '2026-10-05',
      hours: 3,
      place: 'Community Kitchen',
      shiftId: 's1',
    })
  })

  test('open and rejected shifts still become entries but are not counted', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const entries = shiftsToEntries(
      [
        shift({ id: 'open1', status: 'open', checkIn: '2026-10-05T16:00:00-07:00', checkOut: null, confirmedBy: null }),
        shift({ id: 'rej1', status: 'rejected', reason: 'no show' }),
      ],
      now,
    )
    const s = summarizeMonth(entries, '2026-10', '2026-10-10')
    expect(s.counted).toBe(0)
    expect(s.byType.volunteer).toBe(0)
  })
})

describe('mergeMonth', () => {
  test('returns only entries for the requested month', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const self = [e('2026-09-15', 'work', 4), e('2026-10-01', 'work', 4)]
    const shifts = [shift({ checkIn: '2026-09-20T09:00:00-07:00', checkOut: '2026-09-20T12:00:00-07:00' }), shift({ id: 's2' })]
    const { entries } = mergeMonth(self, shifts, '2026-10', now)
    expect(entries.every((entry) => entry.date.startsWith('2026-10'))).toBe(true)
    expect(entries.some((entry) => entry.shiftId === 's2')).toBe(true)
    expect(entries.some((entry) => entry.shiftId === 's1')).toBe(false)
  })

  test('duplicateDates flags a date with both a self volunteer entry and a shift', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const self = [e('2026-10-05', 'volunteer', 3)]
    const shifts = [shift()]
    const { duplicateDates } = mergeMonth(self, shifts, '2026-10', now)
    expect(duplicateDates).toEqual(['2026-10-05'])
  })

  test('no duplicate when the self entry is a different type or a different day', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const self = [e('2026-10-05', 'work', 3), e('2026-10-06', 'volunteer', 2)]
    const shifts = [shift()]
    const { duplicateDates } = mergeMonth(self, shifts, '2026-10', now)
    expect(duplicateDates).toEqual([])
  })
})
