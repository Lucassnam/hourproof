import type { Flag, MonthSummary } from "@/lib/hours/types";

// Which plain-word notes show under the pace line. Pure, so it's unit-tested (notes.test.ts).
//
// `workfare_only` is not an engine flag: the engine leaves workfare out of the count
// (docs/research/calfresh-rules-verification.md row 6b: workfare can't be combined with
// other hours), so a workfare-only month would otherwise show 0 with no explanation.
export type Note = Flag | "workfare_only";

export const NOTE_ORDER: Note[] = [
  "job_search_outside_program",
  "job_search_capped",
  "workfare_mixed",
  "workfare_only",
  "behind_pace",
];

// The "tell your county within 10 days" note waits for a week of the month, so someone who
// just started logging isn't alarmed by a pace built on one or two days (fix round 1 ruling).
export const BEHIND_NOTE_MIN_DAYS = 7;

export function notesFor(summary: MonthSummary, isPast: boolean, entryCount: number): Note[] {
  const set = new Set<Note>(summary.flags);
  if (summary.byType.workfare > 0 && !set.has("workfare_mixed")) set.add("workfare_only");
  const showBehind =
    summary.status === "behind" &&
    summary.daysElapsed >= BEHIND_NOTE_MIN_DAYS &&
    // A past month with nothing in it is most likely a month before the person started
    // using the app, not a month they fell behind in.
    !(isPast && entryCount === 0);
  if (!showBehind) set.delete("behind_pace");
  return NOTE_ORDER.filter((note) => set.has(note));
}
