import type { Flag, MonthSummary } from "@/lib/hours/types";

// Which plain-word notes show under the pace line. Pure, so it's unit-tested (notes.test.ts).
//
// `workfare_only` is not an engine flag: the engine leaves workfare out of the count
// (docs/research/calfresh-rules-verification.md row 6b: workfare can't be combined with
// other hours), so a workfare-only month would otherwise show 0 with no explanation.
//
// The engine's `behind_pace` flag is deliberately never a note (fix round 2 ruling). The log
// can't know whether the person was screened under H.R. 1 or is just logging late, so a
// pace-triggered "tell your county" alert can alarm the wrong people (research row 11). The
// 10-day reporting rule lives in the neutral "How the rule works" disclosure instead, and
// the pace line itself stays factual.
export type Note = Exclude<Flag, "behind_pace"> | "workfare_only";

export const NOTE_ORDER: Note[] = [
  "job_search_outside_program",
  "job_search_no_program",
  "job_search_capped",
  "workfare_mixed",
  "workfare_only",
];

export function notesFor(summary: MonthSummary): Note[] {
  const set = new Set<string>(summary.flags);
  if (summary.byType.workfare > 0 && !set.has("workfare_mixed")) set.add("workfare_only");
  return NOTE_ORDER.filter((note) => set.has(note));
}

// "Doesn't count" on a row: job search on its own, or in-program job search in a month with
// no program hours (research row 7: it counts only as part of a program, and only while it is
// less than the program hours, so with 0 program hours none of it counts).
export function doesNotCount(summary: MonthSummary, entry: { type: string; inProgram?: boolean }): boolean {
  if (entry.type !== "job_search") return false;
  return entry.inProgram !== true || summary.flags.includes("job_search_no_program");
}

// In-program job-search rows get a "May count partly" tag when the month's job search is
// capped: there are program hours, but the job search is more than they allow (research row 7).
// The engine never sets job_search_capped when program hours are 0 (that's job_search_no_program).
export function mayCountPartly(summary: MonthSummary, entry: { type: string; inProgram?: boolean }): boolean {
  return entry.type === "job_search" && entry.inProgram === true && summary.flags.includes("job_search_capped");
}
