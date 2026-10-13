import { describe, expect, it } from 'vitest'
import { addDays, addMonths, californiaDate, californiaInstant, daysInMonth, monthOf } from './dates'

describe('californiaDate', () => {
  it('converts a UTC instant to the America/Los_Angeles calendar date', () => {
    // 2026-11-01T06:30:00Z is 2026-10-31 23:30 PDT (UTC-7).
    expect(californiaDate(new Date('2026-11-01T06:30:00Z'))).toBe('2026-10-31')
  })

  it('defaults to the current time when no argument is given', () => {
    expect(californiaDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('californiaDate does not depend on how a locale formats dates (M8)', () => {
  it('builds YYYY-MM-DD from the year/month/day parts, even if en-CA formatting changes', () => {
    // If a browser's en-CA ever formats as DD/MM/YYYY, format() would give the wrong string.
    // (format is a getter that returns a bound function.)
    const proto = Intl.DateTimeFormat.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'format')!
    Object.defineProperty(proto, 'format', { configurable: true, get: () => () => '26/09/2026' })
    try {
      expect(californiaDate(new Date('2026-09-26T19:00:00Z'))).toBe('2026-09-26')
    } finally {
      Object.defineProperty(proto, 'format', original)
    }
  })

  it('pads single-digit months and days', () => {
    expect(californiaDate(new Date('2026-03-05T20:00:00Z'))).toBe('2026-03-05')
  })

  it('late evening in California is still the California day (UTC is already tomorrow)', () => {
    expect(californiaDate(new Date('2026-01-01T07:59:00Z'))).toBe('2025-12-31')
  })
})

describe('monthOf', () => {
  it('truncates a full date to its year-month', () => {
    expect(monthOf('2026-10-31')).toBe('2026-10')
  })
})

describe('daysInMonth', () => {
  it('returns 28 for a non-leap February', () => {
    expect(daysInMonth('2026-02')).toBe(28)
  })

  it('returns 29 for a leap February', () => {
    expect(daysInMonth('2028-02')).toBe(29)
  })

  it('returns 31 for October', () => {
    expect(daysInMonth('2026-10')).toBe(31)
  })
})

describe('addMonths', () => {
  it('rolls over into the next year', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })

  it('rolls back into the previous year', () => {
    expect(addMonths('2027-01', -1)).toBe('2026-12')
  })
})

describe('addDays', () => {
  it('moves by calendar days across month and year ends', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('is the previous calendar day on the day after the fall DST change (a 25-hour day)', () => {
    // 2026-11-01 is 25 hours long in California; 24 h before 23:30 that night is still Nov 1.
    expect(addDays(californiaDate(new Date('2026-11-02T07:30:00Z')), -1)).toBe('2026-10-31')
  })
})

describe('californiaInstant', () => {
  it('reads a wall-clock time in California, summer (PDT, UTC-7) and winter (PST, UTC-8)', () => {
    expect(californiaInstant('2026-10-31', '23:30')).toBe('2026-11-01T06:30:00.000Z')
    expect(californiaInstant('2026-12-15', '09:05')).toBe('2026-12-15T17:05:00.000Z')
  })

  it('handles the days of the DST changes', () => {
    // Spring forward 2027-03-14 at 02:00; 03:30 that day is PDT.
    expect(californiaInstant('2027-03-14', '03:30')).toBe('2027-03-14T10:30:00.000Z')
    expect(californiaInstant('2027-03-14', '01:30')).toBe('2027-03-14T09:30:00.000Z')
    // Fall back 2026-11-01 at 02:00; 05:00 that day is PST.
    expect(californiaInstant('2026-11-01', '05:00')).toBe('2026-11-01T13:00:00.000Z')
  })

  it('round-trips with californiaDate', () => {
    const iso = californiaInstant('2026-10-31', '00:10')!
    expect(californiaDate(new Date(iso))).toBe('2026-10-31')
  })

  it('rejects malformed input', () => {
    expect(californiaInstant('2026-10-31', '25:00')).toBeNull()
    expect(californiaInstant('2026-10-31', '')).toBeNull()
    expect(californiaInstant('31/10/2026', '10:00')).toBeNull()
  })
})
