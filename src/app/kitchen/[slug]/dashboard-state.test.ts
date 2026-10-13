import { describe, expect, test } from 'vitest'
import type { KitchenShift } from '@/lib/shifts/types'
import { clockValue } from '@/lib/shifts/format'
import {
  correctedEnd,
  dayDate,
  elapsedParts,
  endTimeReason,
  groupShifts,
  hoursOf,
  rejectReason,
  withInFlight,
} from './dashboard-state'

const HOUR = 60 * 60 * 1000

function ks(over: Partial<KitchenShift>): KitchenShift {
  return {
    id: 's1',
    kitchenId: 'k1',
    kitchenName: 'Kitchen A',
    checkIn: '2026-09-27T17:00:00.000Z', // 10:00 in California
    checkOut: null,
    status: 'open',
    confirmedBy: null,
    reason: null,
    autoClosed: false,
    volunteerName: 'Maria',
    ...over,
  }
}

describe('kitchen dashboard helpers', () => {
  test('groups shifts by status, each oldest first (compared as instants)', () => {
    const g = groupShifts([
      ks({ id: 'p2', status: 'pending', checkIn: '2026-09-27T18:00:00Z', checkOut: '2026-09-27T19:00:00Z' }),
      ks({ id: 'o1', status: 'open' }),
      ks({ id: 'c1', status: 'confirmed', checkOut: '2026-09-27T18:00:00Z' }),
      // Postgres spells offsets differently; 17:30+00:00 is still before 18:00Z.
      ks({ id: 'p1', status: 'pending', checkIn: '2026-09-27 17:30:00+00', checkOut: '2026-09-27T19:00:00Z' }),
      ks({ id: 'r1', status: 'rejected', checkOut: '2026-09-27T18:00:00Z' }),
    ])
    expect(g.now.map((s) => s.id)).toEqual(['o1'])
    expect(g.waiting.map((s) => s.id)).toEqual(['p1', 'p2'])
    expect(g.done.map((s) => s.id)).toEqual(['c1', 'r1'])
  })

  test('hours are rounded down to a quarter hour; open shifts have none', () => {
    // 10:02 to 13:14 is 3 h 12 min: 3 hours, never 3.25.
    expect(hoursOf(ks({ checkIn: '2026-09-27T17:02:00Z', checkOut: '2026-09-27T20:14:00Z', status: 'pending' }))).toBe(3)
    expect(hoursOf(ks({}))).toBeNull()
  })

  test('an auto-closed or over-10-hour waiting shift needs an end time; others do not', () => {
    const inIso = '2026-09-27T17:00:00Z'
    expect(endTimeReason(ks({ status: 'pending', autoClosed: true, checkOut: '2026-09-28T01:00:00Z' }))).toBe('autoClosed')
    expect(endTimeReason(ks({ status: 'pending', checkIn: inIso, checkOut: '2026-09-28T03:15:00Z' }))).toBe('overLimit')
    // Exactly 10 hours is allowed.
    expect(endTimeReason(ks({ status: 'pending', checkIn: inIso, checkOut: '2026-09-28T03:00:00Z' }))).toBeNull()
    // A zero-length shift can't be confirmed as it stands either.
    expect(endTimeReason(ks({ status: 'pending', checkIn: inIso, checkOut: inIso }))).toBe('overLimit')
    expect(endTimeReason(ks({ status: 'open' }))).toBeNull()
    expect(endTimeReason(ks({ status: 'confirmed', autoClosed: true, checkOut: '2026-09-28T01:00:00Z' }))).toBeNull()
  })

  test('the corrected end time is read in California time on the check-in date', () => {
    const s = ks({ status: 'pending', autoClosed: true, checkOut: '2026-09-28T01:00:00Z' })
    const now = Date.parse('2026-09-28T12:00:00Z')
    expect(correctedEnd(s, '14:30', now)).toEqual({ ok: true, iso: '2026-09-27T21:30:00.000Z' })
    expect(clockValue('2026-09-27T21:30:00.000Z')).toBe('14:30')
  })

  test('a time at or before check-in means the shift ran past midnight', () => {
    // Checked in 22:00 California (05:00Z next day), left 01:30.
    const s = ks({ status: 'pending', autoClosed: true, checkIn: '2026-09-28T05:00:00Z', checkOut: '2026-09-28T13:00:00Z' })
    expect(correctedEnd(s, '01:30', Date.parse('2026-09-29T00:00:00Z'))).toEqual({ ok: true, iso: '2026-09-28T08:30:00.000Z' })
  })

  test('the corrected end time is refused when missing, over 10 hours, or in the future', () => {
    const s = ks({ status: 'pending', autoClosed: true, checkOut: '2026-09-28T01:00:00Z' })
    const now = Date.parse('2026-09-28T12:00:00Z')
    expect(correctedEnd(s, '', now)).toEqual({ ok: false, problem: 'missing' })
    // 10:00 check-in; 20:15 is 10 h 15 min.
    expect(correctedEnd(s, '20:15', now)).toEqual({ ok: false, problem: 'invalid' })
    expect(correctedEnd(s, '20:00', now)).toMatchObject({ ok: true })
    // 10:00 exactly is check-in itself: read as the next day, which is far over 10 hours.
    expect(correctedEnd(s, '10:00', now)).toEqual({ ok: false, problem: 'invalid' })
    expect(correctedEnd(s, '14:00', Date.parse('2026-09-27T20:00:00Z'))).toEqual({ ok: false, problem: 'future' })
  })

  test('"yesterday" is the previous California calendar day, even on the 25-hour DST day', () => {
    // 23:30 PST on Nov 1 2026: 24 hours earlier is still Nov 1.
    const late = new Date('2026-11-02T07:30:00Z')
    expect(dayDate('today', late)).toBe('2026-11-01')
    expect(dayDate('yesterday', late)).toBe('2026-10-31')
  })

  test('elapsed time never goes negative', () => {
    const at = Date.parse('2026-09-27T17:00:00Z')
    expect(elapsedParts('2026-09-27T17:00:00Z', at + 2 * HOUR + 5 * 60_000)).toEqual({ h: 2, m: 5 })
    expect(elapsedParts('2026-09-27T17:00:00Z', at - HOUR)).toEqual({ h: 0, m: 0 })
  })

  test('a refresh keeps the optimistic version of a shift whose decision is still saving', () => {
    const pending = ks({ id: 'a', status: 'pending', checkOut: '2026-09-27T19:00:00Z' })
    const confirmed = { ...pending, status: 'confirmed' as const, confirmedBy: 'Sam' }
    const other = ks({ id: 'b' })
    expect(withInFlight([pending, other], new Map([['a', confirmed]]))).toEqual([confirmed, other])
    expect(withInFlight([pending], new Map())).toEqual([pending])
  })

  test('a reject reason is a chip label or the typed text, 1 to 280 characters', () => {
    const label = (c: 'didntWork' | 'wrongTimes') => (c === 'didntWork' ? "Didn't work this shift" : 'Times are wrong')
    expect(rejectReason(null, '', label)).toEqual({ ok: false, problem: 'missing' })
    expect(rejectReason('didntWork', 'ignored', label)).toEqual({ ok: true, reason: "Didn't work this shift" })
    expect(rejectReason('other', '   ', label)).toEqual({ ok: false, problem: 'missing' })
    expect(rejectReason('other', '  Left early  ', label)).toEqual({ ok: true, reason: 'Left early' })
    expect(rejectReason('other', 'x'.repeat(281), label)).toEqual({ ok: false, problem: 'tooLong' })
  })
})
