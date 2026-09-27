"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { addMonths, californiaDate, monthOf } from "@/lib/dates";
import { getMode, openStore, type EntryStore } from "@/lib/hours/store";
import { summarizeMonth } from "@/lib/hours/summarize";
import type { Entry, MonthSummary } from "@/lib/hours/types";
import { EntryForm } from "./EntryForm";
import { Ring } from "./Ring";
import { formatDay, formatMonth, formatNumber } from "./format";
import { notesFor } from "./notes";

// The hour log: one route, two views. The list (ring, pace line, notes, entries) is the
// default; the add/edit form is `?add=1` / `?edit=<id>`. Views switch with the native
// history API (which Next's router syncs into useSearchParams) instead of router.push,
// so opening the form never asks the server for anything: it works offline, and the
// phone's Back button closes the form.
//
// Entries live only in IndexedDB on this device (see @/lib/hours/store). Nothing here
// sends them anywhere.

type Loaded = { store: EntryStore; entries: Entry[] };

export function HourLog() {
  const t = useTranslations("log");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [today] = useState(() => californiaDate());
  const currentMonth = monthOf(today);
  const [month, setMonth] = useState(currentMonth);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // True when this page itself pushed the form's history entry, so closing the form can
  // pop it (history.back) instead of stacking another /log entry.
  const pushedForm = useRef(false);

  // Open the right database (real or demo) once, on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = getMode();
        const store = await openStore(mode);
        const entries = await store.list();
        if (cancelled) return;
        // The demo seeds the previous month too when today is day 1-3 (the current month
        // has barely started); open on it so the demo has a month to show. The current month
        // is never empty in the demo (it always has the job-search entry), so this keys on
        // the day, not on an empty current month.
        if (mode === "demo") {
          const prev = addMonths(monthOf(today), -1);
          const hasPrev = entries.some((e) => monthOf(e.date) === prev);
          if (Number(today.slice(8, 10)) <= 3 && hasPrev) setMonth(prev);
        }
        setLoaded({ store, entries });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const editId = searchParams.get("edit");
  const adding = searchParams.get("add") === "1";
  const editing = editId && loaded ? loaded.entries.find((e) => e.id === editId) : undefined;
  const view: "list" | "add" | "edit" = adding ? "add" : editId ? "edit" : "list";

  // An ?edit= id that isn't (or is no longer) on this device falls back to the list.
  useEffect(() => {
    if (view === "edit" && loaded && !editing) window.history.replaceState(null, "", "/log");
  }, [view, loaded, editing]);

  // Focus the new view's heading when the view changes (not on first load).
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view]);

  const openForm = (query: string) => {
    setStatus("");
    pushedForm.current = true;
    window.history.pushState(null, "", `/log?${query}`);
  };

  const closeForm = useCallback(() => {
    if (pushedForm.current) {
      pushedForm.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/log");
    }
  }, []);

  const reload = async (store: EntryStore) => {
    const entries = await store.list();
    setLoaded({ store, entries });
  };

  const monthEntries = useMemo(
    () => (loaded ? loaded.entries.filter((e) => monthOf(e.date) === month) : []),
    [loaded, month],
  );
  const summary = useMemo(() => summarizeMonth(monthEntries, month, today), [monthEntries, month, today]);

  const fmt = (n: number) => formatNumber(locale, n);
  const hoursText = (n: number) => t("hoursN", { n: fmt(n), count: n });

  if (view !== "list" && loaded && (view === "add" || editing)) {
    return (
      <Screen banner={<DemoBanner />}>
        <EntryForm
          key={editing?.id ?? "new"}
          store={loaded.store}
          today={today}
          initial={editing}
          headingRef={headingRef}
          onCancel={closeForm}
          onSaved={async (entry) => {
            await reload(loaded.store);
            setMonth(monthOf(entry.date));
            setStatus(`${t("saved")} ${t(`types.${entry.type}.label`)}, ${hoursText(entry.hours)}, ${formatDay(locale, entry.date)}.`);
            closeForm();
          }}
          onDeleted={async () => {
            await reload(loaded.store);
            setStatus(t("deleted"));
            closeForm();
          }}
        />
      </Screen>
    );
  }

  const isPast = month < currentMonth;
  const monthName = formatMonth(locale, month);
  const met = summary.status === "met";
  const ringLabel = isPast
    ? t("ring.labelPast", { counted: fmt(summary.counted), month: monthName })
    : met
      ? t("ring.labelMet", { counted: fmt(summary.counted) })
      : t("ring.label", { counted: fmt(summary.counted) });

  const notes = loaded ? notesFor(summary, isPast, monthEntries.length) : [];
  const groups = groupByDate(monthEntries);

  return (
    <Screen banner={<DemoBanner />}>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold outline-none">
        {t("title")}
      </h1>

      <nav aria-label={monthName} className="-mt-2 flex items-center justify-between gap-2">
        <MonthButton
          label={t("prevMonth")}
          direction="prev"
          onClick={() => {
            setStatus("");
            setMonth((m) => addMonths(m, -1));
          }}
        />
        <div className="flex flex-col items-center text-center">
          <p aria-live="polite" className="font-display text-xl font-semibold">
            {monthName}
          </p>
          {isPast && <p className="text-lg text-text-muted">{t("pastMonth")}</p>}
        </div>
        <MonthButton
          label={t("nextMonth")}
          direction="next"
          disabled={month >= currentMonth}
          onClick={() => {
            setStatus("");
            setMonth((m) => (m >= currentMonth ? m : addMonths(m, 1)));
          }}
        />
      </nav>

      {loadFailed ? (
        <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger">
          {t("loadError")}
        </p>
      ) : (
        <>
          <Ring
            counted={summary.counted}
            countedText={fmt(summary.counted)}
            label={loaded ? ringLabel : t("loading")}
            unitText={t("ring.of80")}
            doneText={t("ring.done")}
            met={met}
            loading={!loaded}
          />

          {loaded && (
            <p className="text-center text-xl font-semibold leading-snug" data-testid="pace">
              {paceLine(summary, isPast, monthEntries.length, fmt, t)}
            </p>
          )}

          {notes.length > 0 && (
            <section aria-labelledby="log-notes" className="flex flex-col gap-2 rounded-2xl border-2 border-pace bg-surface p-4">
              <h2 id="log-notes" className="text-lg font-semibold text-pace">
                {t("notes.title")}
              </h2>
              <ul className="flex list-disc flex-col gap-2 pl-6">
                {notes.map((note) => (
                  <li key={note} className="text-lg leading-snug text-text">
                    {t(`notes.${note}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p role="status" className="text-center text-lg font-semibold text-proof empty:hidden">
            {status}
          </p>

          <button
            type="button"
            onClick={() => openForm("add=1")}
            disabled={!loaded}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-signal bg-signal px-6 text-lg font-semibold text-bg disabled:border-border disabled:bg-surface-2 disabled:text-text-muted"
          >
            {t("addHours")}
          </button>

          {loaded && (
            <section aria-labelledby="log-list" className="flex flex-col gap-4">
              <h2 id="log-list" className="font-display text-xl font-semibold">
                {t("listTitle")}
              </h2>
              {groups.length === 0 ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4" data-testid="empty">
                  <p className="text-lg font-semibold">{t("empty")}</p>
                  <p className="text-lg leading-snug text-text-muted">{t("emptyWhat")}</p>
                </div>
              ) : (
                groups.map(([date, dayEntries]) => (
                  <div key={date} className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-text-muted">{formatDay(locale, date)}</h3>
                    <ul className="flex flex-col gap-2">
                      {dayEntries.map((entry) => {
                        const notCounted = entry.type === "job_search" && !entry.inProgram;
                        const typeLabel = t(`types.${entry.type}.label`);
                        return (
                          <li
                            key={entry.id}
                            className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface py-2 pr-2 pl-4"
                          >
                            <div className="flex min-w-0 flex-1 flex-col">
                              <p className="text-lg font-semibold">{typeLabel}</p>
                              <p className="text-lg tabular-nums">{hoursText(entry.hours)}</p>
                              {entry.place && <p className="truncate text-lg text-text-muted">{entry.place}</p>}
                              {notCounted && <p className="text-lg font-semibold text-pace">{t("notCounted")}</p>}
                              {entry.type === "workfare" && (
                                <p className="text-lg font-semibold text-pace">{t("workfareTag")}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => openForm(`edit=${encodeURIComponent(entry.id)}`)}
                              aria-label={t("editLabel", {
                                type: typeLabel,
                                hours: hoursText(entry.hours),
                                date: formatDay(locale, entry.date),
                              })}
                              className="min-h-12 min-w-12 shrink-0 rounded-2xl border-2 border-border bg-surface-2 px-4 text-lg font-semibold"
                            >
                              {t("edit")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}

      <footer className="mt-2 flex flex-col gap-3 border-t-2 border-border pt-4">
        <p className="flex items-start gap-2 text-lg text-text-muted">
          <LockIcon />
          <span>{t("savedOnPhone")}</span>
        </p>
        {/* A plain link: /screener is a different route with its own server render. */}
        <a href="/screener" className="self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4 min-h-12 flex items-center">
          {t("checkRule")}
        </a>
      </footer>
    </Screen>
  );
}

function paceLine(
  summary: MonthSummary,
  isPast: boolean,
  entryCount: number,
  fmt: (n: number) => string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (isPast) {
    if (summary.status === "met") return t("pace.pastMet");
    if (entryCount === 0) return t("pace.pastEmpty");
    return t("pace.pastBehind", { counted: fmt(summary.counted) });
  }
  switch (summary.status) {
    case "met":
      return t("pace.met");
    case "on_track":
      return t("pace.on_track", { projected: fmt(summary.projected) });
    case "behind":
      if (summary.neededPerDay === null || summary.daysLeft === 0) {
        return t("pace.behindLastDay", { remaining: fmt(summary.remaining), remainingN: summary.remaining });
      }
      return t("pace.behind", {
        remaining: fmt(summary.remaining),
        remainingN: summary.remaining,
        daysLeft: summary.daysLeft,
        perDay: fmt(summary.neededPerDay),
        // The plural follows the number as shown (1.04 shows as "1", so "hour").
        perDayN: Math.round(summary.neededPerDay * 10) / 10,
      });
    case "not_started":
    case "future":
    default:
      return t("pace.not_started");
  }
}

// Newest date first; within a date, the store's order (newest entry first).
function groupByDate(entries: Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.date) ?? [];
    list.push(entry);
    groups.set(entry.date, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
}

function MonthButton({
  label,
  direction,
  disabled = false,
  onClick,
}: {
  label: string;
  direction: "prev" | "next";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 min-w-12 items-center justify-center rounded-full border-2 border-border bg-surface-2 text-text disabled:border-dashed disabled:bg-transparent disabled:text-text-muted disabled:opacity-60"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {direction === "prev" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
