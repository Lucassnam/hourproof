// Shared date helpers. The app's rules are California rules, so "today" is always the
// California calendar date (America/Los_Angeles), not the device's or the server's — see
// californiaDate. monthOf/daysInMonth/addMonths operate on plain 'YYYY-MM'/'YYYY-MM-DD'
// strings so callers never need a Date/timezone round-trip for month arithmetic.

// Converts `now` to the California calendar date. Using a fixed time zone (not the device's
// or the server's) means the server render and the browser agree on which rules are active,
// so e.g. the question count can't differ between them.
export function californiaDate(now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

// 'YYYY-MM-DD' -> 'YYYY-MM'
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

// 'YYYY-MM' -> number of days in that month.
export function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of `month`.
  return new Date(year, mon, 0).getDate()
}

// 'YYYY-MM', n -> 'YYYY-MM' shifted by n months (n may be negative).
export function addMonths(month: string, n: number): string {
  const [year, mon] = month.split('-').map(Number)
  const total = (year * 12 + (mon - 1)) + n
  const newYear = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`
}
