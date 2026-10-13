"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { MonthButton } from "@/components/ui/MonthButton";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { addMonths, californiaDate, monthOf } from "@/lib/dates";
import { demoKitchenView } from "@/lib/hours/demo";
import { mergeMonth } from "@/lib/hours/merge";
import { getMode, openStore, type EntryStore, type Mode } from "@/lib/hours/store";
import { summarizeMonth } from "@/lib/hours/summarize";
import type { Entry, MonthSummary } from "@/lib/hours/types";
import { useKitchenShifts } from "@/lib/shifts/useKitchenShifts";
import { requestPersistence } from "@/lib/storage/persist";
import { EntryForm } from "./EntryForm";
import { KeepSafe } from "./KeepSafe";
import { Ring } from "./Ring";
import { formatDay, formatMonth, formatNumber } from "./format";
import { doesNotCount, mayCountPartly, notesFor } from "./notes";

// The hour log: one route, two views. The list (ring, pace line, notes, entries) is the
// default; the add/edit form is `?add=1` / `?edit=<id>`. Views switch with the native
// history API (which Next's router syncs into useSearchParams) instead of router.push,
// so opening the form never asks the server for anything: it works offline, and the
// phone's Back button closes the form.
//
// Entries live only in IndexedDB on this device (see @/lib/hours/store). Nothing here
// sends them anywhere.
//
// Kitchen shifts (ShiftCred) are the one thing that comes from the server, and only for a
// browser that has checked in at a kitchen (see useKitchenShifts). They are merged into the
// month for display and counting, never written into the hour log's database, and can't be
// edited here: the kitchen's record is the record.

type Loaded = { store: EntryStore; entries: Entry[]; mode: Mode };

// The supervisor's name on the demo's sample kitchen shift. A first name reads the same in
// English and Spanish.
const DEMO_SUPERVISOR = "Rosa";
// How far back the log asks the server for kitchen shifts.
const SHIFT_MONTHS_BACK = 12;

export function HourLog() {
  const t = useTranslations("log");
  const demoKitchen = useTranslations("demo")("kitchen");
  const locale = useLocale();
  const searchParams = useSearchParams();
  // The day the log opened on picks the demo's starting month (below). `today` itself is
  // recomputed whenever the phone comes back to this page (a tab left open overnight, a phone
  // woken from sleep), so the pace line, the ring's month and the form's date limit never
  // stay on yesterday.
  const [openedOn] = useState(() => californiaDate());
  const [today, setToday] = useState(openedOn);
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
          const prev = addMonths(monthOf(openedOn), -1);
          const hasPrev = entries.some((e) => monthOf(e.date) === prev);
          if (Number(openedOn.slice(8, 10)) <= 3 && hasPrev) setMonth(prev);
        }
        setLoaded({ store, entries, mode });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openedOn]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      setToday(californiaDate());
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // A new month started while the log was showing the old current month: follow it (a month
  // the person chose to look back at stays put).
  const shownCurrentMonth = useRef(currentMonth);
  useEffect(() => {
    const previous = shownCurrentMonth.current;
    shownCurrentMonth.current = currentMonth;
    if (previous !== currentMonth) setMonth((m) => (m === previous ? currentMonth : m));
  }, [currentMonth]);

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
    setLoaded((current) => (current ? { ...current, store, entries } : current));
  };

  const shiftsSince = `${addMonths(currentMonth, -SHIFT_MONTHS_BACK)}-01`;
  const { shifts, syncFailed } = useKitchenShifts(loaded?.mode === "real", shiftsSince);

  // The month as shown and counted: the person's own entries plus kitchen shifts. `today` is a
  // dependency so a shift left open overnight reads as auto-closed when the phone wakes up.
  const { monthEntries, duplicateDates } = useMemo(() => {
    if (!loaded) return { monthEntries: [] as Entry[], duplicateDates: [] as string[] };
    if (loaded.mode === "demo") {
      const shown = demoKitchenView(loaded.entries, today, demoKitchen, DEMO_SUPERVISOR);
      return { monthEntries: shown.filter((e) => monthOf(e.date) === month), duplicateDates: [] as string[] };
    }
    const merged = mergeMonth(loaded.entries, shifts, month, new Date());
    return { monthEntries: merged.entries, duplicateDates: merged.duplicateDates };
  }, [loaded, shifts, month, today, demoKitchen]);
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
            // Real hours now live on this phone: ask the browser not to clear them when it
            // runs low on space. Not awaited, and never in the demo.
            if (loaded.mode === "real") void requestPersistence();
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
  const ringBase = isPast
    ? t("ring.labelPast", { counted: fmt(summary.counted), month: formatMonth(locale, month, { capitalize: false }) })
    : met
      ? t("ring.labelMet", { counted: fmt(summary.counted) })
      : t("ring.label", { counted: fmt(summary.counted) });
  const hasVerified = summary.verifiedCounted > 0;
  // Some of the base labels end with a period and some don't; the two sentences always
  // get exactly one between them.
  const ringLabel = hasVerified
    ? `${ringBase.replace(/\.$/, "")}. ${t("ring.verifiedPart", { verified: fmt(summary.verifiedCounted) })}`
    : ringBase;
  const hasShiftRows = monthEntries.some((e) => e.source === "shift");

  const notes = loaded ? notesFor(summary) : [];
  const groups = groupByDate(monthEntries);

  return (
    <Screen banner={<DemoBanner />}>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold outline-none">
        {t("title")}
      </h1>

      {/* At 200% zoom (180px wide) the month name gets its own row above the two buttons. */}
      <nav aria-label={monthName} className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <MonthButton
          label={t("prevMonth")}
          direction="prev"
          onClick={() => {
            setStatus("");
            setMonth((m) => addMonths(m, -1));
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col items-center text-center max-[260px]:order-first max-[260px]:basis-full">
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
            verified={summary.verifiedCounted}
            countedText={fmt(summary.counted)}
            label={loaded ? ringLabel : t("loading")}
            unitText={t("ring.of80")}
            doneText={isPast ? t("ring.donePast") : t("ring.done")}
            met={met}
            loading={!loaded}
          />

          {/* Shown only once a kitchen has verified something: the solid part of the ring is
              theirs, the striped part is the person's own log. Shape, not just color. */}
          {loaded && hasVerified && (
            <ul className="-mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-lg text-text-muted" data-testid="ring-legend">
              <li className="flex items-center gap-2">
                <LegendSwatch striped={false} />
                {t("legend.verified")}
              </li>
              <li className="flex items-center gap-2">
                <LegendSwatch striped />
                {t("legend.own")}
              </li>
            </ul>
          )}

          {loaded && (
            <p className="text-center text-xl font-semibold leading-snug" data-testid="pace">
              {paceLine(summary, isPast, monthEntries.length, fmt, t)}
            </p>
          )}

          {(notes.length > 0 || duplicateDates.length > 0) && (
            <section aria-labelledby="log-notes" className="flex flex-col gap-2 rounded-2xl border-2 border-pace bg-surface p-4">
              <h2 id="log-notes" className="text-lg font-semibold text-pace">
                {t("notes.title")}
              </h2>
              <ul className="flex list-disc flex-col gap-2 pl-6">
                {duplicateDates.map((date) => (
                  <li key={date} className="text-lg leading-snug text-text" data-testid="duplicate-note">
                    {t("shift.duplicate", { date: formatDay(locale, date) })}
                  </li>
                ))}
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
          {/* Quiet reassurance for patchy signal: saving never needs the network. Not shown
              when this browser can't open the store (the error above says so instead). */}
          <p className="-mt-3 text-center text-lg text-text-muted" data-testid="offline-note">
            {t("offline")}
          </p>

          {loaded && (
            <section aria-labelledby="log-list" className="flex flex-col gap-4">
              <h2 id="log-list" className="font-display text-xl font-semibold">
                {t("listTitle")}
              </h2>
              {syncFailed && (
                <p className="-mt-2 text-lg leading-snug text-text-muted" data-testid="shift-sync-failed">
                  {t("shift.syncFailed")}
                </p>
              )}
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
                        const notCounted = doesNotCount(summary, entry);
                        const typeLabel = t(`types.${entry.type}.label`);
                        const isShift = entry.source === "shift";
                        const isOpen = isShift && entry.verification === "open";
                        return (
                          <li
                            key={entry.id}
                            className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface py-2 pr-2 pl-4"
                          >
                            <div className="flex min-w-0 flex-1 flex-col">
                              <p className="text-lg font-semibold">{typeLabel}</p>
                              {/* A shift still in progress has no length yet. */}
                              {!isOpen && <p className="text-lg tabular-nums">{hoursText(entry.hours)}</p>}
                              {entry.place && <p className="truncate text-lg text-text-muted">{entry.place}</p>}
                              {isShift && (
                                <p
                                  data-testid="shift-status"
                                  className={"text-lg font-semibold " + (entry.verification === "confirmed" ? "text-proof" : "text-pace")}
                                >
                                  {shiftStatus(entry, t)}
                                </p>
                              )}
                              {isShift && entry.autoClosed && entry.verification === "pending" && (
                                <p className="text-lg leading-snug text-text-muted">{t("shift.autoClosed")}</p>
                              )}
                              {notCounted && <p className="text-lg font-semibold text-pace">{t("notCounted")}</p>}
                              {mayCountPartly(summary, entry) && (
                                <p className="text-lg font-semibold text-pace">{t("mayCountPartly")}</p>
                              )}
                              {entry.type === "workfare" && (
                                <p className="text-lg font-semibold text-pace">{t("workfareTag")}</p>
                              )}
                            </div>
                            {/* A kitchen shift is the kitchen's record: no Edit here. */}
                            {!isShift && <button
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
                            </button>}
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

      {/* Neutral background, collapsed by default: the rule's basics, including the 10-day
          report, without the log claiming it knows the person is behind or screened. */}
      <details className="group rounded-2xl border-2 border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          <span>{t("rule.title")}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ul className="flex list-disc flex-col gap-2 pr-4 pb-4 pl-10">
          <li className="text-lg leading-snug">{t("rule.adds")}</li>
          <li className="text-lg leading-snug">{t("rule.jobSearch")}</li>
          <li className="text-lg leading-snug">{t("rule.report")}</li>
        </ul>
      </details>

      {loaded && loaded.mode === "real" && <KeepSafe store={loaded.store} today={today} onRestored={() => reload(loaded.store)} />}

      <footer className="mt-2 flex flex-col gap-3 border-t-2 border-border pt-4">
        <p className="flex items-start gap-2 text-lg text-text-muted">
          <LockIcon />
          <span>{t("savedOnPhone")}</span>
        </p>
        {hasShiftRows && <p className="text-lg leading-snug text-text-muted">{t("shift.fromKitchen")}</p>}
        {/* A plain link: /screener is a different route with its own server render. */}
        <a href="/proof" className="self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4 min-h-12 flex items-center">
          {t("proofLink")}
        </a>
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
    if (summary.status === "met") return t("pace.pastMet", { counted: fmt(summary.counted) });
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
      });
    case "not_started":
    case "future":
    default:
      return t("pace.not_started");
  }
}

function shiftStatus(entry: Entry, t: (key: string, values?: Record<string, string | number>) => string): string {
  switch (entry.verification) {
    case "confirmed":
      return entry.confirmedBy ? t("shift.confirmed", { name: entry.confirmedBy }) : t("shift.confirmedNoName");
    case "rejected":
      return entry.reason ? t("shift.rejected", { reason: entry.reason }) : t("shift.rejectedNoReason");
    case "open":
      return t("shift.open");
    default:
      return t("shift.pending");
  }
}

// The same two looks as the ring's arcs, small.
function LegendSwatch({ striped }: { striped: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {striped ? (
        <>
          <defs>
            <pattern id="hp-legend-stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="3.5" height="6" className="fill-proof" />
            </pattern>
          </defs>
          <rect x="1" y="1" width="18" height="18" rx="4" fill="url(#hp-legend-stripes)" className="stroke-proof" strokeWidth="1.5" />
        </>
      ) : (
        <rect x="1" y="1" width="18" height="18" rx="4" className="fill-proof" />
      )}
    </svg>
  );
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

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
