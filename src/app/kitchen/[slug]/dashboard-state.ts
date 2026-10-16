// Pure helpers for the kitchen dashboard (/kitchen/[slug]). No backend, no storage:
// Dashboard.tsx feeds these the shifts it fetched and renders what they say.
import { addDays, californiaDate, californiaInstant } from "@/lib/dates";
import { needsCorrection, shiftHours, shiftLogDate } from "@/lib/shifts/rules";
import type { KitchenShift } from "@/lib/shifts/types";

// Today, yesterday, or a day the supervisor picked (YYYY-MM-DD).
export type DayKey = "today" | "yesterday" | (string & {});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The California date the dashboard asks for. "Yesterday" is the previous calendar day,
// not 24 hours ago (which, on a 25-hour DST day, can still be today).
export function dayDate(day: DayKey, now: Date = new Date()): string {
  const today = californiaDate(now);
  if (day === "today") return today;
  if (day === "yesterday") return addDays(today, -1);
  return ISO_DATE.test(day) ? day : today;
}

// The key for a date from the "Another day" picker: today and yesterday keep their own
// buttons pressed; a future or malformed date is refused (null).
export function pickedDay(date: string, now: Date = new Date()): DayKey | null {
  if (!ISO_DATE.test(date)) return null;
  const today = californiaDate(now);
  if (date > today) return null;
  if (date === today) return "today";
  if (date === addDays(today, -1)) return "yesterday";
  return date;
}

// How long after a decision Undo is offered. The backend's undo_decision allows 24 hours;
// the button goes away a few minutes early so a tap never races the cutoff.
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

export function canUndo(s: KitchenShift, nowMs: number): boolean {
  if (s.status !== "confirmed" && s.status !== "rejected") return false;
  if (!s.decidedAt) return false;
  const age = nowMs - Date.parse(s.decidedAt);
  return age >= 0 && age < UNDO_WINDOW_MS;
}

function byCheckIn(a: KitchenShift, b: KitchenShift): number {
  // Compared as instants: Postgres and the mock don't spell ISO times the same way.
  return Date.parse(a.checkIn) - Date.parse(b.checkIn) || a.id.localeCompare(b.id);
}

export type ShiftGroups = {
  now: KitchenShift[]; // open
  waiting: KitchenShift[]; // pending, oldest first
  done: KitchenShift[]; // confirmed or rejected
};

export function groupShifts(shifts: KitchenShift[]): ShiftGroups {
  const sorted = [...shifts].sort(byCheckIn);
  return {
    now: sorted.filter((s) => s.status === "open"),
    waiting: sorted.filter((s) => s.status === "pending"),
    done: sorted.filter((s) => s.status === "confirmed" || s.status === "rejected"),
  };
}

// The hours a closed shift counts for: real elapsed time, rounded down to a quarter hour.
export function hoursOf(s: KitchenShift): number | null {
  return s.checkOut ? shiftHours(s.checkIn, s.checkOut) : null;
}

// Why a waiting shift can't be confirmed as it stands, if it can't: the backend closed it
// at 8 hours because the volunteer never checked out, or it's over 10 hours (or ends at or
// before its own start). Either way Confirm needs the real end time first.
export function endTimeReason(s: KitchenShift): "autoClosed" | "overLimit" | null {
  if (s.status !== "pending") return null;
  if (s.autoClosed) return "autoClosed";
  if (needsCorrection(s)) return "overLimit";
  return null;
}

export type EndTimeCheck =
  | { ok: true; iso: string }
  | { ok: false; problem: "missing" | "invalid" | "future" };

// Turns the supervisor's "Time they left" (an <input type="time"> value, California time)
// into the instant sent as the corrected check-out, and checks it the way the backend will:
// after check-in, at most 10 hours later (rules.needsCorrection), and not in the future.
// The time is read on the California date of check-in; a time at or before check-in means
// the shift ran past midnight, so it's read on the next day.
export function correctedEnd(s: KitchenShift, time: string, nowMs: number = Date.now()): EndTimeCheck {
  if (!time) return { ok: false, problem: "missing" };
  const day = shiftLogDate(s.checkIn);
  let iso = californiaInstant(day, time);
  if (!iso) return { ok: false, problem: "invalid" };
  if (Date.parse(iso) <= Date.parse(s.checkIn)) iso = californiaInstant(addDays(day, 1), time);
  if (!iso || needsCorrection(s, iso)) return { ok: false, problem: "invalid" };
  if (Date.parse(iso) > nowMs) return { ok: false, problem: "future" };
  return { ok: true, iso };
}

// The live "since" counter for someone checked in: whole minutes, never negative.
export function elapsedParts(checkIn: string, nowMs: number): { h: number; m: number } {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(checkIn)) / 60_000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

// A refresh that lands while a decision is still being saved must not flash that shift back
// to "Waiting": rows with a decision in flight keep their optimistic version.
export function withInFlight(fresh: KitchenShift[], inFlight: ReadonlyMap<string, KitchenShift>): KitchenShift[] {
  if (inFlight.size === 0) return fresh;
  return fresh.map((s) => inFlight.get(s.id) ?? s);
}

// The reject reason that is sent: a chip's label, or the supervisor's own words for Other.
export type ReasonChoice = "didntWork" | "wrongTimes" | "other";
export function rejectReason(
  choice: ReasonChoice | null,
  otherText: string,
  chipLabel: (c: Exclude<ReasonChoice, "other">) => string,
): { ok: true; reason: string } | { ok: false; problem: "missing" | "tooLong" } {
  if (!choice) return { ok: false, problem: "missing" };
  const reason = choice === "other" ? otherText.trim() : chipLabel(choice);
  if (reason.length < 1) return { ok: false, problem: "missing" };
  if (reason.length > 280) return { ok: false, problem: "tooLong" };
  return { ok: true, reason };
}
