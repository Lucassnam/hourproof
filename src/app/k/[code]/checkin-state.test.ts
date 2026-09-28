import { describe, expect, test } from 'vitest'
import type { Shift } from '@/lib/shifts/types'
import { deriveCheckin, elapsedParts, formatClock, formatShiftHours, lookbackDate, sentHours } from './checkin-state'

function shift(over: Partial<Shift>): Shift {
  return {
    id: 's1',
    kitchenId: 'k1',
    kitchenName: 'Kitchen A',
    checkIn: '2026-09-27T17:00:00.000Z',
    checkOut: null,
    status: 'open',
    confirmedBy: null,
    reason: null,
    autoClosed: false,
    ...over,
  }
}

describe('check-in page helpers', () => {
  test('clock times are California time in the page locale', () => {
    // 17:02Z on Sep 27 is 10:02 in California (PDT), whatever the device zone is.
    // A no-break space, so the time never wraps between "10:02" and "AM".
    expect(formatClock('en', '2026-09-27T17:02:00Z')).toBe('10:02\u00a0AM')
    expect(formatClock('es', '2026-09-27T20:14:00Z')).toBe('13:14')
  })

  test('hours keep quarter hours exactly (never rounded up for display)', () => {
    expect(formatShiftHours('en', 3)).toBe('3')
    expect(formatShiftHours('en', 2.75)).toBe('2.75')
    expect(formatShiftHours('es', 2.25)).toBe('2,25')
  })

  test('10:02 to 13:14 is sent as 3 hours (rounded down)', () => {
    expect(sentHours(shift({ checkIn: '2026-09-27T17:02:00Z', checkOut: '2026-09-27T20:14:00Z' }))).toBe(3)
    expect(sentHours(shift({ checkOut: null }))).toBe(0)
  })

  test('elapsed time is whole minutes, split into hours and minutes, never negative', () => {
    const checkIn = '2026-09-27T17:00:00Z'
    expect(elapsedParts(checkIn, Date.parse('2026-09-27T18:12:59Z'))).toEqual({ h: 1, m: 12 })
    expect(elapsedParts(checkIn, Date.parse('2026-09-27T17:00:30Z'))).toEqual({ h: 0, m: 0 })
    expect(elapsedParts(checkIn, Date.parse('2026-09-27T16:00:00Z'))).toEqual({ h: 0, m: 0 })
  })

  test('the lookback covers an open shift from yesterday (California)', () => {
    expect(lookbackDate(new Date('2026-09-27T09:00:00Z'))).toBe('2026-09-25')
  })

  describe('deriveCheckin', () => {
    test('an open shift here is "in"', () => {
      const open = shift({})
      expect(deriveCheckin('k1', [open], null)).toEqual({ open, elsewhere: null, autoClosed: null })
    })

    test('an open shift at another kitchen is "elsewhere"', () => {
      const open = shift({ kitchenId: 'k2', kitchenName: 'Kitchen B' })
      expect(deriveCheckin('k1', [open], null)).toEqual({ open: null, elsewhere: open, autoClosed: null })
    })

    test('the latest shift, auto-closed and still pending, shows the notice once per shift', () => {
      const old = shift({ id: 's0', checkIn: '2026-09-26T17:00:00Z', checkOut: '2026-09-26T19:00:00Z', status: 'confirmed' })
      const closed = shift({ checkOut: '2026-09-28T01:00:00Z', status: 'pending', autoClosed: true })
      expect(deriveCheckin('k1', [old, closed], null).autoClosed).toBe(closed)
      expect(deriveCheckin('k1', [closed, old], null).autoClosed).toBe(closed)
      expect(deriveCheckin('k1', [old, closed], 's1').autoClosed).toBeNull()
    })

    test('no notice when a later shift exists or the supervisor already decided', () => {
      const closed = shift({ checkOut: '2026-09-28T01:00:00Z', status: 'pending', autoClosed: true })
      const later = shift({ id: 's2', checkIn: '2026-09-28T02:00:00Z', checkOut: '2026-09-28T03:00:00Z', status: 'pending' })
      expect(deriveCheckin('k1', [closed, later], null).autoClosed).toBeNull()
      expect(deriveCheckin('k1', [{ ...closed, status: 'confirmed' }], null).autoClosed).toBeNull()
    })
  })
})
