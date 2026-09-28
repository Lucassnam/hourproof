// Shared date helpers. The app's rules are California rules, so "today" is always the
// California calendar date (America/Los_Angeles), not the device's or the server's — see
// californiaDate. monthOf/daysInMonth/addMonths operate on plain 'YYYY-MM'/'YYYY-MM-DD'
// strings so callers never need a Date/timezone round-trip for month arithmetic.

// Converts `now` to the California calendar date. Using a fixed time zone (not the device's
// or the server's) means the server render and the browser agree on which rules are active,
// so e.g. the question count can't differ between them.
export function californiaDate(now: Date = new Date()): string {
  try {
    // Built from the year/month/day parts, not from a locale's formatted string, so it
    // doesn't depend on any locale printing YYYY-MM-DD.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
    const year = part('year').padStart(4, '0')
    const month = part('month').padStart(2, '0')
    const day = part('day').padStart(2, '0')
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) return `${year}-${month}-${day}`
  } catch {
    // Fall through: a browser without time-zone support.
  }
  return now.toISOString().slice(0, 10)
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

// 'YYYY-MM-DD', n -> 'YYYY-MM-DD' shifted by n calendar days (n may be negative). Pure date
// arithmetic, so "yesterday" is the previous calendar day even across a DST change (unlike
// subtracting 24 hours from an instant, which can land on the same California date).
export function addDays(date: string, n: number): string {
  const [year, mon, day] = date.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon - 1, day + n))
  return d.toISOString().slice(0, 10)
}

// The minutes California is ahead of UTC (negative: -420 in summer, -480 in winter) at `ms`.
function californiaOffsetMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'))
  return Math.round((asUtc - (ms - (ms % 1000))) / 60_000)
}

// The instant (ISO) of a California wall-clock time: '2026-10-31' + '14:05' -> the moment
// it's 14:05 in California that day. Returns null for a malformed date or time. In the
// hour a DST change skips or repeats, it picks the reading that's consistent after one
// correction (good enough for a supervisor typing when a volunteer left).
export function californiaInstant(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [h, mi] = [Number(tm[1]), Number(tm[2])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  // Guess with the offset at the wall time read as UTC, then correct once with the offset
  // at the guessed instant.
  let ms = wall - californiaOffsetMinutes(wall) * 60_000
  ms = wall - californiaOffsetMinutes(ms) * 60_000
  return new Date(ms).toISOString()
}
