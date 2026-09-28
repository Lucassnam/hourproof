// Merges kitchen shifts (ShiftCred) into a volunteer's self-logged entries
// for the month view. Pure: no storage, no backend calls.

import { monthOf } from '@/lib/dates'
import { effectiveShift, shiftHours, shiftLogDate } from '@/lib/shifts/rules'
import type { Shift } from '@/lib/shifts/types'
import type { Entry } from './types'

// Converts shifts into Entries, applying the auto-close rule first so a
// stale open shift already reads as pending/autoClosed. Open shifts (still
// genuinely open) get 0 hours since there's nothing to count yet.
export function shiftsToEntries(shifts: readonly Shift[], now: Date): Entry[] {
  return shifts.map((raw) => {
    const s = effectiveShift(raw, now)
    const hours = s.checkOut ? shiftHours(s.checkIn, s.checkOut) : 0
    const entry: Entry = {
      id: `shift-${s.id}`,
      date: shiftLogDate(s.checkIn),
      type: 'volunteer',
      hours,
      place: s.kitchenName,
      createdAt: s.checkIn,
      source: 'shift',
      verification: s.status,
      shiftId: s.id,
      autoClosed: s.autoClosed,
    }
    if (s.confirmedBy != null) entry.confirmedBy = s.confirmedBy
    if (s.reason != null) entry.reason = s.reason
    return entry
  })
}

// Merges self-logged entries and kitchen shifts for one month, and flags any
// calendar date that has both a self-logged 'volunteer' entry and a shift
// (the "you may have logged this shift twice" case). Only the requested
// month's entries are returned.
export function mergeMonth(
  self: readonly Entry[],
  shifts: readonly Shift[],
  month: string,
  now: Date,
): { entries: Entry[]; duplicateDates: string[] } {
  const selfMonth = self.filter((entry) => monthOf(entry.date) === month)
  const shiftEntries = shiftsToEntries(shifts, now).filter((entry) => monthOf(entry.date) === month)

  const shiftDates = new Set(shiftEntries.map((entry) => entry.date))
  const duplicateDates = Array.from(
    new Set(
      selfMonth
        .filter((entry) => entry.type === 'volunteer' && (entry.source ?? 'self') === 'self' && shiftDates.has(entry.date))
        .map((entry) => entry.date),
    ),
  ).sort()

  return { entries: [...selfMonth, ...shiftEntries], duplicateDates }
}
