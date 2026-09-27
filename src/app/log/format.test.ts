import { describe, expect, test } from 'vitest'
import { formatDay, formatHoursInput, formatMonth, formatNumber, newId, parseHours } from './format'

describe('hour log formatting', () => {
  test('parseHours accepts a dot or a comma, and nothing else', () => {
    expect(parseHours('4')).toBe(4)
    expect(parseHours(' 2.5 ')).toBe(2.5)
    expect(parseHours('2,25')).toBe(2.25)
    expect(parseHours('.5')).toBe(0.5)
    for (const bad of ['', 'abc', '1.2.3', '1,2,3', '-1', '4h']) expect(parseHours(bad)).toBeNaN()
  })

  test('numbers use one decimal and the locale mark; 79.75 never shows as 80', () => {
    expect(formatNumber('en', 52)).toBe('52')
    expect(formatNumber('es', 52.5)).toBe('52,5')
    expect(formatNumber('en', 79.75)).toBe('79.8')
    expect(formatHoursInput('es', 2.25)).toBe('2,25')
    expect(formatHoursInput('en', 1000)).toBe('1000')
  })

  test('months and days are formatted from the calendar date, not the device time zone', () => {
    expect(formatMonth('en', '2026-09')).toBe('September 2026')
    expect(formatMonth('es', '2026-09')).toBe('Septiembre de 2026')
    expect(formatMonth('es', '2026-09', { capitalize: false })).toBe('septiembre de 2026')
    expect(formatDay('en', '2026-10-01')).toBe('Thursday, October 1')
    expect(formatDay('es', '2026-10-01')).toBe('Jueves, 1 de octubre')
  })

  test('newId returns a v4-shaped id', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
