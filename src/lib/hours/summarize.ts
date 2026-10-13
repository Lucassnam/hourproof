// CalFresh ABAWD month summary: counts hours toward the 80-hour/month work
// requirement and validates individual entries. All hour math below is done
// in integer quarter-hours (hours * 4) and converted back to hours only at
// the boundary, so repeated quarter-hour additions (e.g. 79.75 + 0.25) never
// drift due to floating point.
//
// Sources (docs/research/calfresh-rules-verification.md rows 6a, 6b, 7):
// - 6a: 80 hours/month target. CDSS ACL 26-29:
//   https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2026/26-29.pdf
// - 6b: work + volunteer + program combine; workfare cannot combine with
//   anything else. SCC handbook, "Satisfying the ABAWD Work Requirement":
//   https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/ABAWDs/StsfygABAWDWkReq.htm
// - 7: job search counts only inside a qualifying E&T/WIOA/Trade Act
//   program, and only while under half of the combined program + job-search
//   total. Same SCC handbook URL as above.

import { daysInMonth, monthOf } from '@/lib/dates'
import { ACTIVITY_TYPES, type ActivityType, type Entry, type EntryError, type Flag, type MonthStatus, type MonthSummary } from './types'

const TARGET_QUARTERS = 80 * 4

// Converts hours to integer quarter-hours. Callers are expected to have
// already validated hours are a multiple of 0.25 (see validateEntry); this
// rounds defensively so a stray float never propagates through the sums.
function toQuarters(hours: number): number {
  return Math.round(hours * 4)
}

function toHours(quarters: number): number {
  return quarters / 4
}

// Checks only calendar validity (e.g. rejects 2026-02-30) using local-time
// Date construction; it never needs California time since it doesn't
// resolve "today", only whether the given y/m/d combination exists.
function isValidDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const dt = new Date(year, month - 1, day)
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day
}

export function validateEntry(entry: Entry, sameDayOthers: readonly Entry[]): EntryError[] {
  const errors: EntryError[] = []

  if (!isValidDate(entry.date)) {
    errors.push('bad_date')
  }

  const quarters = toQuarters(entry.hours)
  const isQuarterMultiple = Math.abs(entry.hours * 4 - quarters) < 1e-9
  if (entry.hours <= 0 || entry.hours > 24 || !isQuarterMultiple) {
    errors.push('bad_hours')
  }

  const dayTotalQuarters = quarters + sameDayOthers.reduce((sum, other) => sum + toQuarters(other.hours), 0)
  if (dayTotalQuarters > 24 * 4) {
    errors.push('too_many_hours_that_day')
  }

  if (entry.inProgram && entry.type !== 'job_search') {
    errors.push('in_program_only_for_job_search')
  }

  return errors
}

// A shift-backed entry (source 'shift') whose verification is 'open' or
// 'rejected' doesn't count toward anything: it's excluded here, before any
// other math, so it behaves as if it weren't in the list at all (not counted,
// not in byType, doesn't affect flags or pace).
function isExcludedShift(entry: Entry): boolean {
  return entry.source === 'shift' && (entry.verification === 'open' || entry.verification === 'rejected')
}

export function summarizeMonth(entries: readonly Entry[], month: string, today: string): MonthSummary {
  const monthEntries = entries.filter((entry) => monthOf(entry.date) === month && !isExcludedShift(entry))

  const byType: Record<ActivityType, number> = Object.fromEntries(
    ACTIVITY_TYPES.map((type) => [type, 0]),
  ) as Record<ActivityType, number>

  const byTypeQuarters: Record<ActivityType, number> = Object.fromEntries(
    ACTIVITY_TYPES.map((type) => [type, 0]),
  ) as Record<ActivityType, number>

  let jobSearchInProgramQuarters = 0
  let jobSearchOutsideProgramQuarters = 0
  let verifiedCountedQuarters = 0

  for (const entry of monthEntries) {
    const quarters = toQuarters(entry.hours)
    byTypeQuarters[entry.type] += quarters
    if (entry.source === 'shift' && entry.verification === 'confirmed') {
      verifiedCountedQuarters += quarters
    }
    if (entry.type === 'job_search') {
      if (entry.inProgram) {
        jobSearchInProgramQuarters += quarters
      } else {
        jobSearchOutsideProgramQuarters += quarters
      }
    }
  }

  for (const type of ACTIVITY_TYPES) {
    byType[type] = toHours(byTypeQuarters[type])
  }

  const programQuarters = byTypeQuarters.program
  // Job search counts only as part of a program, and only while it stays
  // strictly less than the program's own hours (i.e. under half of the
  // combined program + job-search total): min(jobSearchInProgram, max(0,
  // program - one quarter-hour)).
  const jobSearchCountedQuarters = Math.min(jobSearchInProgramQuarters, Math.max(0, programQuarters - 1))

  const countedQuarters = byTypeQuarters.work + byTypeQuarters.volunteer + byTypeQuarters.program + jobSearchCountedQuarters

  const flags: Flag[] = []
  if (byTypeQuarters.workfare > 0 && ACTIVITY_TYPES.some((t) => t !== 'workfare' && byTypeQuarters[t] > 0)) {
    flags.push('workfare_mixed')
  }
  if (jobSearchOutsideProgramQuarters > 0) {
    flags.push('job_search_outside_program')
  }
  if (jobSearchInProgramQuarters > 0 && programQuarters === 0) {
    // Nothing to be part of: with no program hours this month, none of the
    // in-program job search counts. That's a different message from "capped".
    flags.push('job_search_no_program')
  } else if (jobSearchInProgramQuarters > jobSearchCountedQuarters) {
    flags.push('job_search_capped')
  }

  const counted = toHours(countedQuarters)
  const verifiedCounted = toHours(verifiedCountedQuarters)
  const remaining = toHours(Math.max(0, TARGET_QUARTERS - countedQuarters))
  const jobSearchCountedHours = toHours(jobSearchCountedQuarters)

  const totalDaysInMonth = daysInMonth(month)
  const currentMonth = monthOf(today)

  let daysElapsed: number
  let daysLeft: number
  let isFuture = false
  let isPast = false

  if (month === currentMonth) {
    daysElapsed = Number(today.slice(8, 10))
    daysLeft = totalDaysInMonth - daysElapsed
  } else if (month < currentMonth) {
    isPast = true
    daysElapsed = totalDaysInMonth
    daysLeft = 0
  } else {
    isFuture = true
    daysElapsed = 0
    daysLeft = totalDaysInMonth
  }

  const projected = daysElapsed > 0 ? (counted / daysElapsed) * totalDaysInMonth : 0

  const met = counted >= 80

  let neededPerDay: number | null = null
  if (!met && daysLeft > 0) {
    neededPerDay = remaining / daysLeft
  }

  let status: MonthStatus
  if (isFuture) {
    status = 'future'
  } else if (met) {
    status = 'met'
  } else if (isPast) {
    status = 'behind'
  } else if (counted === 0) {
    status = 'not_started'
  } else if (projected >= 80) {
    status = 'on_track'
  } else {
    status = 'behind'
  }

  if (status === 'behind') {
    flags.push('behind_pace')
  }

  return {
    month,
    target: 80,
    counted,
    verifiedCounted,
    remaining,
    byType,
    jobSearchCounted: jobSearchCountedHours,
    daysInMonth: totalDaysInMonth,
    daysElapsed,
    daysLeft,
    projected,
    neededPerDay,
    status,
    flags,
  }
}
