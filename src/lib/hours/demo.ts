// Deterministic demo data for "Try the demo" mode. This never touches the real
// on-device database — see store.ts's separate 'hourproof-demo' database.
//
// The demo persona is a composite (like the PRD's "Marco"): variable warehouse
// work shifts, two community-kitchen volunteer shifts, and one job-search
// entry outside a qualifying program (so the "outside a program" flag shows).
// The counted total is deliberately kept around 65% of the prorated 80-hour
// target through "today", so the demo shows a 'behind' status with a
// meaningful hours-per-day number rather than a suspiciously tidy 100%.
//
// Determinism: no Math.random, no Date.now(). Ids and timestamps are derived
// entirely from `today` and a running index, so the same `today` always
// produces byte-identical entries.

import { addMonths, daysInMonth, monthOf } from '@/lib/dates'
import type { ActivityType, Entry } from './types'

const DEMO_FRACTION_OF_TARGET = 0.65

// A repeating cycle of shift lengths (hours) used for the warehouse work
// shifts, so shifts feel "variable" rather than uniform.
const SHIFT_HOURS = [6, 4, 8, 5, 7, 3]

function quarterRound(hours: number): number {
  return Math.round(hours * 4) / 4
}

// Builds one month's worth of demo entries, spread across days 1..throughDay
// (inclusive), targeting roughly 65% of that month's prorated 80-hour target.
function buildMonthEntries(month: string, throughDay: number): Entry[] {
  const totalDays = daysInMonth(month)
  const proratedTarget = (throughDay / totalDays) * 80
  const goal = quarterRound(proratedTarget * DEMO_FRACTION_OF_TARGET)

  const entries: Entry[] = []
  let counted = 0
  let index = 0
  let volunteerPlaced = 0

  const addEntry = (day: number, type: ActivityType, hours: number, extra: Partial<Entry> = {}) => {
    index += 1
    const date = `${month}-${String(day).padStart(2, '0')}`
    entries.push({
      id: `demo-${date}-${index}`,
      date,
      type,
      hours: quarterRound(hours),
      createdAt: `${date}T18:00:00.000Z`,
      ...extra,
    })
  }

  // Warehouse shifts every other day, with the 3rd and 6th shifts swapped
  // for community-kitchen volunteering, until the goal is reached or we run
  // out of days. (Shift index, not calendar day, decides which slots are
  // volunteering, since the day sequence below only ever lands on odd days.)
  const VOLUNTEER_SHIFT_INDICES = [2, 5]
  let day = 1
  let shiftIdx = 0

  while (day <= throughDay && counted < goal) {
    const remaining = quarterRound(goal - counted)
    if (remaining < 0.25) break

    const rawHours = SHIFT_HOURS[shiftIdx % SHIFT_HOURS.length]
    const hours = Math.min(rawHours, remaining)

    if (volunteerPlaced < VOLUNTEER_SHIFT_INDICES.length && shiftIdx === VOLUNTEER_SHIFT_INDICES[volunteerPlaced]) {
      addEntry(day, 'volunteer', hours, { place: 'Community kitchen' })
      volunteerPlaced += 1
    } else {
      addEntry(day, 'work', hours, { place: 'Warehouse' })
    }

    counted += hours
    shiftIdx += 1
    day += 2
  }

  // One job-search entry outside a qualifying program, placed on the last
  // day covered so far: it doesn't count toward the 80 hours, but it should
  // trip the "outside a program" flag. It's safe to double it up with that
  // day's work/volunteer shift (at most 8h) since 8h + 2h is nowhere near
  // the 24h/day cap.
  if (throughDay >= 1) {
    addEntry(throughDay, 'job_search', 2, { inProgram: false })
  }

  return entries
}

// Deterministic demo entries for the current month of `today`. If `today`
// falls within the first three days of the month, the previous month is
// seeded too (fully, since it's over), so the demo has history to show when
// the current month has barely started.
export function demoEntries(today: string): Entry[] {
  const month = monthOf(today)
  const dayOfMonth = Number(today.slice(8, 10))

  const currentMonthEntries = buildMonthEntries(month, dayOfMonth)

  if (dayOfMonth <= 3) {
    const prevMonth = addMonths(month, -1)
    const prevMonthEntries = buildMonthEntries(prevMonth, daysInMonth(prevMonth))
    return [...prevMonthEntries, ...currentMonthEntries]
  }

  return currentMonthEntries
}
