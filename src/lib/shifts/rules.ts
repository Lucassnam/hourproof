// Pure shift-duration and status rules for ShiftCred. No side effects, no
// backend calls: this is the "never overclaim hours" logic, shared by the
// mock backend and (mirrored in SQL) the real backend.
//
// Rounding: shift length is floored to the nearest quarter hour, computed
// from the ISO instants (real elapsed time), never from wall-clock
// subtraction — see src/lib/shifts/cases.ts for the DST case this protects
// against.

import { californiaDate } from '@/lib/dates'
import type { Shift, ShiftStatus } from './types'

export const AUTO_CLOSE_HOURS = 8
export const MAX_CONFIRM_HOURS = 10

const QUARTER_HOUR_MS = 15 * 60 * 1000

// Real elapsed milliseconds between two ISO instants, floored to the nearest
// quarter hour and converted to hours. Never negative.
function durationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const quarters = Math.max(0, Math.floor(ms / QUARTER_HOUR_MS))
  return quarters / 4
}

export function shiftHours(checkIn: string, checkOut: string): number {
  return durationHours(checkIn, checkOut)
}

export function autoCloseAt(checkIn: string): string {
  return new Date(new Date(checkIn).getTime() + AUTO_CLOSE_HOURS * 60 * 60 * 1000).toISOString()
}

// Applies the auto-close rule at read time: an open shift strictly older
// than 8h (not yet 8h old still counts as open) is treated as pending,
// closed at exactly 8h, and marked autoClosed so the supervisor can correct
// it. Any other status passes through unchanged. Strict `>`, not `>=`, so
// this agrees with Task 2's SQL, which also auto-closes only past 8h.
export function effectiveShift(s: Shift, now: Date): Shift {
  if (s.status !== 'open') return s
  const closeAt = autoCloseAt(s.checkIn)
  if (now.getTime() > new Date(closeAt).getTime()) {
    return { ...s, status: 'pending', checkOut: closeAt, autoClosed: true }
  }
  return s
}

// True when the shift (using correctedCheckOut if given, else the shift's
// own checkOut) is over MAX_CONFIRM_HOURS, or the correction is invalid
// (at or before check-in). A still-open shift with no correction offered
// has nothing to evaluate yet, so it doesn't need correction.
//
// The 10-hour limit is on the real elapsed time, not the rounded-down hours,
// exactly as the SQL's `v_end - check_in > interval '10 hours'`: 10 h 05 min
// needs correction even though it would count as 10.0 hours.
export function needsCorrection(s: Shift, correctedCheckOut?: string): boolean {
  const checkOut = correctedCheckOut ?? s.checkOut
  if (checkOut == null) return false
  const checkInMs = new Date(s.checkIn).getTime()
  const checkOutMs = new Date(checkOut).getTime()
  if (checkOutMs <= checkInMs) return true
  return checkOutMs - checkInMs > MAX_CONFIRM_HOURS * 60 * 60 * 1000
}

// A shift's log date is the California calendar date of check-in.
export function shiftLogDate(checkIn: string): string {
  return californiaDate(new Date(checkIn))
}

export function countsToward(status: ShiftStatus): boolean {
  return status === 'pending' || status === 'confirmed'
}
