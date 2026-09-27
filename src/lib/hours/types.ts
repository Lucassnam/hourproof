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
}

export type Flag = 'workfare_mixed' | 'job_search_outside_program' | 'job_search_capped' | 'behind_pace'

export type MonthStatus = 'met' | 'on_track' | 'behind' | 'not_started' | 'future'

export type MonthSummary = {
  month: string
  target: 80
  counted: number
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
