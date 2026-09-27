import { describe, expect, it } from 'vitest'
import { addMonths, californiaDate, daysInMonth, monthOf } from './dates'

describe('californiaDate', () => {
  it('converts a UTC instant to the America/Los_Angeles calendar date', () => {
    // 2026-11-01T06:30:00Z is 2026-10-31 23:30 PDT (UTC-7).
    expect(californiaDate(new Date('2026-11-01T06:30:00Z'))).toBe('2026-10-31')
  })

  it('defaults to the current time when no argument is given', () => {
    expect(californiaDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
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
