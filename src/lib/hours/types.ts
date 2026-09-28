// Types for the CalFresh ABAWD 80-hour/month work requirement.
//
// Sources (see docs/research/calfresh-rules-verification.md rows 6a, 6b, 7):
// - 6a: 20 hrs/week averaged monthly, totaling at least 80 hours/month.
//   CDSS ACL 26-29 (ABAWD Time Limit Handbook v3.0):
//   https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2026/26-29.pdf
// - 6b: work, volunteering and qualifying programs combine; workfare cannot be
//   combined with anything else. Santa Clara County handbook, "Satisfying the
//   ABAWD Work Requirement":
//   https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/ABAWDs/StsfygABAWDWkReq.htm
// - 7: job search counts only as part of a qualifying E&T/WIOA/Trade Act
//   program, and only while it is less than half of the combined program
//   total (SCC-SAT: "up to 9 hours per week, averaged monthly"). Same SCC
//   handbook URL as above.

import type { ShiftStatus } from '@/lib/shifts/types'

export const ACTIVITY_TYPES = ['work', 'volunteer', 'program', 'job_search', 'workfare'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type Entry = {
  id: string
  date: string /* YYYY-MM-DD */
  type: ActivityType
  hours: number
  inProgram?: boolean /* job_search only: part of an E&T/WIOA/Trade Act program */
  place?: string
  note?: string
  createdAt: string /* ISO */
  // ShiftCred (Phase 3) additions. All optional so every existing self-logged
  // entry (and everything already stored in IndexedDB) stays valid without a
  // migration. A missing `source` means 'self'.
  source?: 'self' | 'shift'
  verification?: ShiftStatus /* only set when source is 'shift' */
  shiftId?: string
  autoClosed?: boolean
  confirmedBy?: string
  reason?: string
}

export type Flag =
  | 'workfare_mixed'
  | 'job_search_outside_program'
  | 'job_search_no_program' /* in-program job search, but 0 program hours this month: none of it counts */
  | 'job_search_capped' /* in-program job search, program hours > 0, some of it over the cap */
  | 'behind_pace'
// Note: no 'possible_duplicate' Flag. The plan's duplicate detection lives in
// mergeMonth's `duplicateDates` (a set of calendar dates), which is a UI-level
// concern about a specific day, not a month-summary flag summarizeMonth would
// need to compute. Adding an unused Flag member would be speculative, so it's
// left out (YAGNI) unless a later task actually needs summarizeMonth to know
// about duplicates.

export type MonthStatus = 'met' | 'on_track' | 'behind' | 'not_started' | 'future'

export type MonthSummary = {
  month: string
  target: 80
  counted: number
  verifiedCounted: number /* hours from confirmed shifts; a subset of counted */
  remaining: number
  byType: Record<ActivityType, number>
  jobSearchCounted: number
  daysInMonth: number
  daysElapsed: number
  daysLeft: number
  projected: number
  neededPerDay: number | null
  status: MonthStatus
  flags: Flag[]
}

export type EntryError = 'bad_date' | 'bad_hours' | 'too_many_hours_that_day' | 'in_program_only_for_job_search'
