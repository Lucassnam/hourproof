import type { ActivityEntry, WeekSummary } from "./types";

export const WEEKLY_HOURS_TARGET = 20;
export const MONTHLY_HOURS_TARGET = 80;
export const WEEKLY_EARNINGS_TARGET = 217.5;

export function currentMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(now);
}

export function monthEntries(entries: readonly ActivityEntry[], month: string) {
  return entries.filter((entry) => entry.date.startsWith(month));
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function weeksInMonth(month: string, entries: readonly ActivityEntry[], today = new Date()): WeekSummary[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const todayString = dateString(today);
  return [[1, 7], [8, 14], [15, 21], [22, lastDay]].map(([startDay, endDay]) => {
    const start = new Date(Date.UTC(year, monthNumber - 1, startDay));
    const end = new Date(Date.UTC(year, monthNumber - 1, endDay));
    const startText = dateString(start);
    const endText = dateString(end);
    const matching = entries.filter((entry) => entry.date >= startText && entry.date <= endText);
    const hours = matching.reduce((sum, entry) => sum + entry.hours, 0);
    const earnings = matching.reduce((sum, entry) => sum + entry.grossEarnings, 0);
    return {
      start: startText,
      end: endText,
      label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}–${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
      hours,
      earnings,
      status: hours >= WEEKLY_HOURS_TARGET || earnings >= WEEKLY_EARNINGS_TARGET ? "on-track" : startText > todayString ? "upcoming" : "gap",
    } as WeekSummary;
  });
}

export function totals(entries: readonly ActivityEntry[]) {
  return entries.reduce((result, entry) => ({ hours: result.hours + entry.hours, earnings: result.earnings + entry.grossEarnings }), { hours: 0, earnings: 0 });
}
