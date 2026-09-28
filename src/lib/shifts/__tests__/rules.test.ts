import { describe, expect, test } from 'vitest'
import { SHIFT_CASES } from '../cases'
import { AUTO_CLOSE_HOURS, MAX_CONFIRM_HOURS, autoCloseAt, countsToward, effectiveShift, needsCorrection, shiftHours, shiftLogDate } from '../rules'
import type { Shift } from '../types'

const shift = (over: Partial<Shift> = {}): Shift => ({
  id: 's1',
  kitchenId: 'k1',
  kitchenName: 'Community Kitchen',
  checkIn: '2026-10-05T09:00:00-07:00',
  checkOut: null,
  status: 'open',
  confirmedBy: null,
  reason: null,
  autoClosed: false,
  ...over,
})

describe('shiftHours', () => {
  for (const c of SHIFT_CASES) {
    test(c.name, () => {
      expect(shiftHours(c.checkIn, c.checkOut)).toBe(c.expectedHours)
    })
  }

  test('a reversed checkOut before checkIn is 0, never negative', () => {
    expect(shiftHours('2026-10-05T12:00:00-07:00', '2026-10-05T09:00:00-07:00')).toBe(0)
  })
})

describe('autoCloseAt', () => {
  test('adds AUTO_CLOSE_HOURS to check-in', () => {
    expect(AUTO_CLOSE_HOURS).toBe(8)
    expect(autoCloseAt('2026-10-05T09:00:00-07:00')).toBe(new Date('2026-10-05T17:00:00-07:00').toISOString())
  })
})

describe('effectiveShift', () => {
  test('open shift 9h old becomes pending, autoClosed, checkOut = checkIn + 8h', () => {
    const checkIn = '2026-10-05T09:00:00-07:00'
    const now = new Date(new Date(checkIn).getTime() + 9 * 60 * 60 * 1000)
    const s = shift({ checkIn })
    const eff = effectiveShift(s, now)
    expect(eff.status).toBe('pending')
    expect(eff.autoClosed).toBe(true)
    expect(eff.checkOut).toBe(autoCloseAt(checkIn))
  })

  test('open shift at 7h59 stays open', () => {
    const checkIn = '2026-10-05T09:00:00-07:00'
    const now = new Date(new Date(checkIn).getTime() + (7 * 60 + 59) * 60 * 1000)
    const s = shift({ checkIn })
    const eff = effectiveShift(s, now)
    expect(eff.status).toBe('open')
    expect(eff.autoClosed).toBe(false)
    expect(eff.checkOut).toBeNull()
  })

  test('open shift at exactly 8h stays open (strictly older than 8h auto-closes, not at 8h)', () => {
    const checkIn = '2026-10-05T09:00:00-07:00'
    const now = new Date(new Date(checkIn).getTime() + 8 * 60 * 60 * 1000)
    const s = shift({ checkIn })
    const eff = effectiveShift(s, now)
    expect(eff.status).toBe('open')
    expect(eff.autoClosed).toBe(false)
    expect(eff.checkOut).toBeNull()
  })

  test('non-open shifts pass through unchanged', () => {
    const s = shift({ status: 'confirmed', checkOut: '2026-10-05T12:00:00-07:00' })
    expect(effectiveShift(s, new Date('2030-01-01'))).toEqual(s)
  })
})

describe('needsCorrection', () => {
  test('MAX_CONFIRM_HOURS is 10', () => {
    expect(MAX_CONFIRM_HOURS).toBe(10)
  })

  test('10h15 shift needs correction', () => {
    const s = shift({ checkOut: '2026-10-05T19:15:00-07:00' }) // checkIn 09:00 -> 10h15
    expect(needsCorrection(s)).toBe(true)
  })

  test('a correction to 9h clears it', () => {
    const s = shift({ checkOut: '2026-10-05T19:15:00-07:00' })
    expect(needsCorrection(s, '2026-10-05T18:00:00-07:00')).toBe(false) // 09:00 + 9h
  })

  test('a correction before check-in still needs correction', () => {
    const s = shift({ checkOut: '2026-10-05T19:15:00-07:00' })
    expect(needsCorrection(s, '2026-10-05T08:00:00-07:00')).toBe(true)
  })
})

describe('shiftLogDate', () => {
  test('uses the California date of check-in', () => {
    expect(shiftLogDate('2026-11-01T06:30:00Z')).toBe('2026-10-31')
  })
})

describe('countsToward', () => {
  test('pending and confirmed count', () => {
    expect(countsToward('pending')).toBe(true)
    expect(countsToward('confirmed')).toBe(true)
  })
  test('open and rejected do not count', () => {
    expect(countsToward('open')).toBe(false)
    expect(countsToward('rejected')).toBe(false)
  })
})
