import { describe, expect, test } from "vitest";
import { monthEntries, totals, weeksInMonth } from "./summary";
import type { ActivityEntry } from "./types";

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: crypto.randomUUID(), date: "2026-09-01", type: "work", title: "Job", hours: 0,
  grossEarnings: 0, source: "manual", verified: false, ...overrides,
});

describe("activity summaries", () => {
  test("combines work, volunteer, school, and training hours", () => {
    const entries = [entry({ hours: 10 }), entry({ type: "volunteer", hours: 4 }), entry({ type: "school", hours: 3 }), entry({ type: "training", hours: 3 })];
    expect(totals(entries).hours).toBe(20);
  });

  test("keeps entries inside their calendar month", () => {
    const entries = [entry({ date: "2026-09-30" }), entry({ date: "2026-10-01" })];
    expect(monthEntries(entries, "2026-09")).toHaveLength(1);
  });

  test("uses four 20-hour planning periods so the plan totals 80 hours", () => {
    const entries = [
      entry({ date: "2026-09-02", hours: 20 }),
      entry({ date: "2026-09-10", hours: 20 }),
      entry({ date: "2026-09-17", hours: 20 }),
      entry({ date: "2026-09-25", hours: 20 }),
    ];
    const weeks = weeksInMonth("2026-09", entries, new Date("2026-09-27T12:00:00Z"));
    expect(weeks).toHaveLength(4);
    expect(weeks.map((week) => week.status)).toEqual(["on-track", "on-track", "on-track", "on-track"]);
  });

  test("a paid-work period can be on track through gross earnings", () => {
    const weeks = weeksInMonth("2026-09", [entry({ date: "2026-09-02", hours: 8, grossEarnings: 217.5 })], new Date("2026-09-27T12:00:00Z"));
    expect(weeks[0].status).toBe("on-track");
  });
});

