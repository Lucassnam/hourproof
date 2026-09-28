// Pure helpers for the volunteer check-in page (/k/[code]). No backend, no storage: the
// component (CheckIn.tsx) feeds these the shifts it fetched and renders what they say.
import { californiaDate } from "@/lib/dates";
import { shiftHours } from "@/lib/shifts/rules";
import type { Shift } from "@/lib/shifts/types";

const CALIFORNIA = "America/Los_Angeles";

// "10:02 AM" / "10:02". Always California time (the kitchen's clock), in the page locale.
// Any space inside the time becomes a no-break space, so "10:02" and "AM" never land on
// different lines.
export function formatClock(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: CALIFORNIA })
    .format(new Date(iso))
    .replace(/\s/g, "\u00a0");
}

// Shift hours are whole quarter hours, so two decimals show them exactly ("2.75", "2,25").
// The log's one-decimal format would print 2.75 as "2.8", which overclaims.
export function formatShiftHours(locale: string, hours: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hours);
}

// The hours a checked-out shift was sent with: real elapsed time, rounded down to a
// quarter hour (rules.ts). An open shift has none yet.
export function sentHours(shift: Shift): number {
  return shift.checkOut ? shiftHours(shift.checkIn, shift.checkOut) : 0;
}

// The live "so far" counter: whole minutes since check-in, never negative.
export function elapsedParts(checkIn: string, nowMs: number): { h: number; m: number } {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(checkIn).getTime()) / 60_000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

// How far back the page asks for this device's shifts. An open shift is at most 8 hours
// old (older ones are auto-closed), so two California days always include it, even when
// it started before midnight.
export function lookbackDate(now: Date = new Date()): string {
  return californiaDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
}

export type CheckinDerived = {
  // The open shift at this kitchen: the "Check out" screen.
  open: Shift | null;
  // The open shift at another kitchen: "Check out there first."
  elsewhere: Shift | null;
  // The latest shift, if the backend closed it automatically at 8 hours and no supervisor
  // has decided it yet, and this device hasn't already shown the notice for it.
  autoClosed: Shift | null;
};

export function deriveCheckin(kitchenId: string, shifts: Shift[], seenAutoClosedId: string | null): CheckinDerived {
  const openShift = shifts.find((s) => s.status === "open") ?? null;
  const open = openShift && openShift.kitchenId === kitchenId ? openShift : null;
  const elsewhere = openShift && openShift.kitchenId !== kitchenId ? openShift : null;

  let latest: Shift | null = null;
  for (const s of shifts) {
    // Compared as instants: Postgres and the mock don't spell ISO times the same way.
    if (!latest || Date.parse(s.checkIn) > Date.parse(latest.checkIn)) latest = s;
  }
  const autoClosed =
    !openShift && latest && latest.autoClosed && latest.status === "pending" && latest.id !== seenAutoClosedId
      ? latest
      : null;

  return { open, elsewhere, autoClosed };
}

const RECENT_MS = 12 * 60 * 60 * 1000;

// Check-out timed out (or the answer got lost) but the server did close the shift, so a
// retry comes back `not_checked_in`. This finds that shift, so the page can show the real
// "Sent to … for confirmation" summary instead of "You're not checked in here".
// `openCheckIn` is the check-in time the page was showing; the match compares instants, since
// Postgres and the mock spell ISO times differently. Only when the page has no check-in time
// does the latest closed shift at this kitchen that ended within the last 12 hours stand in.
export function findLandedCheckOut(
  kitchenId: string,
  openCheckIn: string | null,
  shifts: Shift[],
  nowMs: number,
): Shift | null {
  const closedHere = shifts.filter(
    (s) => s.kitchenId === kitchenId && (s.status === "pending" || s.status === "confirmed") && s.checkOut !== null,
  );
  if (openCheckIn) {
    // A known check-in only ever matches itself: an earlier shift from today is not the
    // one the volunteer just tried to close, and showing it would misstate their hours.
    const at = Date.parse(openCheckIn);
    return closedHere.find((s) => Date.parse(s.checkIn) === at) ?? null;
  }
  let latest: Shift | null = null;
  for (const s of closedHere) {
    if (nowMs - Date.parse(s.checkOut!) > RECENT_MS) continue;
    if (!latest || Date.parse(s.checkIn) > Date.parse(latest.checkIn)) latest = s;
  }
  return latest;
}
