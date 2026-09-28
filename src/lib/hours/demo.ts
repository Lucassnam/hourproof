// Deterministic demo data for "Try the demo" mode. This never touches the real
// on-device database — see store.ts's separate 'hourproof-demo' database.
//
// The demo persona is a composite (like the PRD's "Marco"): variable paid work
// shifts, two volunteering shifts, and one job-search entry outside a
// qualifying program (so the "outside a program" flag shows).
//
// Achievable, not hopeless (Task 7 fix round 1 ruling): the current month's
// counted total targets clamp(80 − 3.5 × daysLeft, 10, 76), rounded down to a
// quarter hour.
// That leaves about 3.5 hours a day to go, so the demo shows 'behind' with a
// calm, doable hours-per-day number instead of "12.8 hours a day".
//
// No `place` on demo entries: place names are user data and shown as typed,
// so any seeded name would be English-only text on the Spanish screens.
//
// Determinism: no Math.random, no Date.now(). Ids and timestamps are derived
// entirely from `today` and a running index, so the same `today` always
// produces byte-identical entries.

import { addMonths, daysInMonth, monthOf } from '@/lib/dates'
import type { ActivityType, Entry } from './types'

const PER_DAY_LEFT = 3.5
// The previous month (seeded on days 1-3) is over, so it's shown as done: a past month
// under 80 would read as a failed month (fix round 2 ruling).
export const DEMO_PREVIOUS_MONTH_TOTAL = 82.5
const MIN_GOAL = 10
const MAX_GOAL = 76

// A repeating cycle of shift lengths (hours), so shifts feel "variable".
const SHIFT_HOURS = [6, 4, 8, 5, 7, 3]
// Which shifts (by index) are volunteering instead of paid work.
const VOLUNTEER_SHIFT_INDICES = [2, 5]

function floorQuarter(hours: number): number {
  return Math.floor(hours * 4) / 4
}

// The counted total the seed aims for, given the days left after `throughDay`.
export function demoGoal(month: string, throughDay: number): number {
  const totalDays = daysInMonth(month)
  const daysLeft = totalDays - throughDay
  let goal = floorQuarter(Math.min(MAX_GOAL, Math.max(MIN_GOAL, 80 - PER_DAY_LEFT * daysLeft)))
  // In the first days of a month the 10-hour floor would project past 80 (on
  // track, not behind). Keep the current month 'behind': stay a quarter hour
  // under the pace that projects exactly 80. (The UI opens the demo on the
  // fully seeded previous month on those days anyway.)
  if (daysLeft > 0) {
    const onPace = (80 * throughDay) / totalDays
    if (goal >= onPace) goal = Math.max(0.25, floorQuarter(onPace - 0.25))
  }
  return goal
}

// Builds one month's worth of demo entries on days 1..throughDay (inclusive), with a
// counted total of `goal` hours.
function buildMonthEntries(month: string, throughDay: number, goal: number): Entry[] {
  const entries: Entry[] = []
  let counted = 0
  let index = 0
  let shiftIdx = 0
  let volunteerPlaced = 0

  const addEntry = (day: number, type: ActivityType, hours: number, extra: Partial<Entry> = {}) => {
    index += 1
    const date = `${month}-${String(day).padStart(2, '0')}`
    entries.push({
      id: `demo-${date}-${index}`,
      date,
      type,
      hours,
      createdAt: `${date}T18:00:00.000Z`,
      ...extra,
    })
  }

  // Shifts every other day (1, 3, 5, …); if that isn't enough to reach the
  // goal (a short month near its end), the even days fill the rest.
  const days: number[] = []
  for (let d = 1; d <= throughDay; d += 2) days.push(d)
  for (let d = 2; d <= throughDay; d += 2) days.push(d)

  for (const day of days) {
    const remaining = goal - counted
    if (remaining < 0.25) break
    const hours = Math.min(SHIFT_HOURS[shiftIdx % SHIFT_HOURS.length], remaining)
    if (volunteerPlaced < VOLUNTEER_SHIFT_INDICES.length && shiftIdx === VOLUNTEER_SHIFT_INDICES[volunteerPlaced]) {
      addEntry(day, 'volunteer', hours)
      volunteerPlaced += 1
    } else {
      addEntry(day, 'work', hours)
    }
    counted += hours
    shiftIdx += 1
  }

  // One job-search entry outside a qualifying program on the last day
  // covered: it doesn't count toward the 80 hours, but it trips the "outside
  // a program" note. A shift is at most 8h, so 8h + 2h stays far under 24h.
  if (throughDay >= 1) {
    addEntry(throughDay, 'job_search', 2, { inProgram: false })
  }

  return entries
}

// Deterministic demo entries for the current month of `today`. If `today`
// falls within the first three days of the month, the previous month is
// seeded too (fully, since it's over, and met: DEMO_PREVIOUS_MONTH_TOTAL), so
// the demo has a finished month to show when the current month has barely
// started. /log opens on that month on days 1-3.
export function demoEntries(today: string): Entry[] {
  const month = monthOf(today)
  const dayOfMonth = Number(today.slice(8, 10))

  const currentMonthEntries = buildMonthEntries(month, dayOfMonth, demoGoal(month, dayOfMonth))

  if (dayOfMonth <= 3) {
    const prevMonth = addMonths(month, -1)
    const prevMonthEntries = buildMonthEntries(prevMonth, daysInMonth(prevMonth), DEMO_PREVIOUS_MONTH_TOTAL)
    return [...prevMonthEntries, ...currentMonthEntries]
  }

  return currentMonthEntries
}
