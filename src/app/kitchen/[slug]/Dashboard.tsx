"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { buttonClasses } from "@/components/ui/Button";
import { safeGet, safeSet } from "@/lib/storage/safe";
import { errorCode, loadBackend, withTimeout } from "@/lib/shifts/client-backend";
import { formatClock, formatDayDate, formatShiftDate, formatShiftHours } from "@/lib/shifts/format";
import type { BackendErrorCode, KitchenShift } from "@/lib/shifts/types";
import {
  canUndo,
  correctedEnd,
  dayDate,
  elapsedParts,
  endTimeReason,
  groupShifts,
  hoursOf,
  pickedDay,
  rejectReason,
  withInFlight,
  type DayKey,
  type ReasonChoice,
} from "./dashboard-state";

// The supervisor's screen: a kitchen PIN opens today's (or yesterday's, or a picked day's)
// shifts, and each waiting shift gets Confirm or Reject. Shifts nobody decided by yesterday
// are listed on their own at the top, so none is left waiting (and counting) forever, and a
// decision can be undone for 24 hours. The supervisor is busy mid-service, so the screen
// refreshes itself, shows each decision right away (and puts it back, with a plain message,
// if it didn't save), and never asks for more than the PIN and a first name.
//
// The PIN lives only in this component's state: never in storage, the URL or a log. Close
// or reload the page and it's gone. The supervisor's first name is kept for the browser
// session (sessionStorage), since it's typed on every unlock.

const NAME_KEY = "hp.kitchen.supervisorName";
const REFRESH_MS = 30_000;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1f\x7f]/;
function nameProblem(name: string): boolean {
  return name.length < 1 || name.length > 40 || CONTROL_CHAR.test(name);
}

type Session = { pin: string; name: string };

type Draft = {
  mode: "idle" | "reject";
  endTime: string;
  reason: ReasonChoice | null;
  other: string;
};
const EMPTY_DRAFT: Draft = { mode: "idle", endTime: "", reason: null, other: "" };

export function Dashboard({ slug }: { slug: string }) {
  const t = useTranslations("kitchen");
  const locale = useLocale();

  // Unlock form. The button stays disabled until this component has mounted, so a tap
  // before hydration can't submit the form natively (and put the PIN anywhere).
  const [mounted, setMounted] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [day, setDay] = useState<DayKey>("today");
  // The day on screen right now, for refreshes that start after an await: a decision that
  // finishes saving after the supervisor switched days must reload the new day, not the one
  // it was tapped on (that showed one day's list under another day's name).
  const dayRef = useRef<DayKey>("today");
  const [shifts, setShifts] = useState<KitchenShift[] | null>(null);
  // Still waiting from before yesterday (kitchen_waiting), whatever day is shown.
  const [earlier, setEarlier] = useState<KitchenShift[]>([]);
  const [kitchenName, setKitchenName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Decisions still being saved, by shift id: their optimistic rows survive a refresh.
  const inFlight = useRef(new Map<string, KitchenShift>());
  // Only the newest fetch may update the list (a day switch can overtake a slow refresh).
  const fetchSeq = useRef(0);

  useEffect(() => {
    setMounted(true);
    setNameDraft(safeGet("session", NAME_KEY) ?? "");
  }, []);

  const lockedMessage = useCallback(
    (c: BackendErrorCode) =>
      c === "bad_pin"
        ? t("errors.badPin")
        : c === "locked"
          ? t("errors.locked")
          : c === "not_found"
            ? t("errors.notFound")
            : c === "unavailable"
              ? t("errors.unavailable")
              : c === "network"
                ? t("errors.network")
                : t("errors.generic"),
    [t],
  );

  // Back to the PIN screen: the PIN and the list are dropped from memory.
  const lock = useCallback((message: string | null = null) => {
    fetchSeq.current += 1;
    inFlight.current.clear();
    setSession(null);
    setShifts(null);
    setEarlier([]);
    setDrafts({});
    setRowErrors({});
    setUnlockError(message);
  }, []);

  const applyShifts = useCallback((list: KitchenShift[]) => {
    const merged = withInFlight(list, inFlight.current);
    setShifts(merged);
    const named = merged.find((s) => s.kitchenName);
    if (named) setKitchenName(named.kitchenName);
    setUpdatedAt(Date.now());
    setNow(Date.now());
    setRefreshFailed(false);
  }, []);

  // The shifts still waiting from before yesterday, or null if they couldn't be fetched.
  // Never fails the refresh it's part of: the day's list matters more, and the function
  // only exists once the second migration is applied.
  const fetchEarlier = useCallback(
    async (pin: string): Promise<KitchenShift[] | null> => {
      try {
        const backend = await withTimeout(loadBackend());
        return await withTimeout(backend.kitchenWaiting(slug, pin, dayDate("yesterday")));
      } catch {
        return null;
      }
    },
    [slug],
  );

  // A quiet refresh: on failure the list stays and a line says it's stale; a PIN the
  // backend no longer accepts (a lockout from elsewhere) goes back to the PIN screen.
  const refresh = useCallback(
    async (s: Session, which: DayKey) => {
      const seq = ++fetchSeq.current;
      try {
        const backend = await withTimeout(loadBackend());
        const [list, older] = await Promise.all([
          withTimeout(backend.kitchenShifts(slug, s.pin, dayDate(which))),
          fetchEarlier(s.pin),
        ]);
        if (seq !== fetchSeq.current) return;
        applyShifts(list);
        if (older) setEarlier(withInFlight(older, inFlight.current));
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        const c = errorCode(err);
        if (c === "bad_pin" || c === "locked" || c === "not_found" || c === "unavailable") lock(lockedMessage(c));
        else setRefreshFailed(true);
      }
    },
    [slug, applyShifts, fetchEarlier, lock, lockedMessage],
  );

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (unlockBusy) return;
    const pin = pinDraft.trim();
    const name = nameDraft.trim();
    if (!/^\d{6}$/.test(pin)) return setUnlockError(t("errors.pinFormat"));
    if (nameProblem(name)) return setUnlockError(t("errors.badName"));
    setUnlockBusy(true);
    setUnlockError(null);
    const seq = ++fetchSeq.current;
    try {
      const backend = await withTimeout(loadBackend());
      const list = await withTimeout(backend.kitchenShifts(slug, pin, dayDate(day)));
      if (seq !== fetchSeq.current) return;
      safeSet("session", NAME_KEY, name);
      setPinDraft("");
      setSession({ pin, name });
      applyShifts(list);
      void fetchEarlier(pin).then((older) => {
        if (older && seq === fetchSeq.current) setEarlier(older);
      });
    } catch (err) {
      setUnlockError(lockedMessage(errorCode(err)));
    } finally {
      setUnlockBusy(false);
    }
  };

  const unlocked = session !== null;

  // Land on the new heading when the screen switches between the PIN form and the list.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [unlocked]);

  // Every 30 seconds, and right away when the tablet comes back to this page.
  useEffect(() => {
    if (!session) return;
    const tick = () => void refresh(session, dayRef.current);
    const id = window.setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, day, refresh]);

  const switchDay = (next: DayKey) => {
    if (!session || next === day) return;
    dayRef.current = next;
    setDay(next);
    setShifts(null);
    setDrafts({});
    setRowErrors({});
    void refresh(session, next);
  };

  // A shift can be in the day's list, the earlier list, or both (a picked day in the last
  // 90 days); a saved decision replaces it wherever it is.
  const replaceRow = (id: string, row: KitchenShift) => {
    const swap = <L extends KitchenShift[] | null>(list: L): L =>
      (list ? list.map((s) => (s.id === id ? row : s)) : list) as L;
    setShifts(swap);
    setEarlier(swap);
  };
  const markBusy = (id: string, busy: boolean) =>
    setBusyIds((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const draftOf = (id: string): Draft => drafts[id] ?? EMPTY_DRAFT;
  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY_DRAFT), ...patch } }));
    setRowErrors((errs) => {
      if (!(id in errs)) return errs;
      const next = { ...errs };
      delete next[id];
      return next;
    });
  };
  const setRowError = (id: string, message: string | null) =>
    setRowErrors((errs) => {
      const next = { ...errs };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  const decide = async (shift: KitchenShift, decision: "confirm" | "reject") => {
    if (!session || busyIds.has(shift.id)) return;
    const draft = draftOf(shift.id);

    // Check what the backend would refuse before sending anything.
    let checkOut: string | undefined;
    let reason: string | undefined;
    if (decision === "confirm" && endTimeReason(shift)) {
      const end = correctedEnd(shift, draft.endTime);
      if (!end.ok) {
        return setRowError(
          shift.id,
          end.problem === "missing"
            ? t("errors.needsTime")
            : end.problem === "future"
              ? t("errors.timeFuture")
              : t("errors.timeInvalid", { start: formatClock(locale, shift.checkIn) }),
        );
      }
      checkOut = end.iso;
    }
    if (decision === "reject") {
      const r = rejectReason(draft.reason, draft.other, (c) => t(`reasons.${c}`));
      if (!r.ok) return setRowError(shift.id, r.problem === "tooLong" ? t("errors.reasonTooLong") : t("errors.reasonNeeded"));
      reason = r.reason;
    }

    // Optimistic: the row moves to Done now, and comes back if the save fails.
    const optimistic: KitchenShift = {
      ...shift,
      status: decision === "confirm" ? "confirmed" : "rejected",
      confirmedBy: session.name,
      reason: reason ?? null,
      checkOut: checkOut ?? shift.checkOut,
      decidedAt: new Date().toISOString(),
    };
    inFlight.current.set(shift.id, optimistic);
    replaceRow(shift.id, optimistic);
    markBusy(shift.id, true);
    setRowError(shift.id, null);
    const name = shift.volunteerName || t("volunteer");

    try {
      const backend = await withTimeout(loadBackend());
      const saved = await withTimeout(
        backend.decide(slug, session.pin, shift.id, { decision, supervisor: session.name, reason, checkOut }),
      );
      inFlight.current.delete(shift.id);
      replaceRow(shift.id, saved);
      setDrafts((d) => {
        const next = { ...d };
        delete next[shift.id];
        return next;
      });
      setAnnouncement(decision === "confirm" ? t("confirmedAnnounce", { name }) : t("rejectedAnnounce", { name }));
      void refresh(session, dayRef.current);
    } catch (err) {
      inFlight.current.delete(shift.id);
      // Roll back just this row, to what it was before the tap.
      replaceRow(shift.id, shift);
      const c = errorCode(err);
      if (c === "bad_pin" || c === "locked") return lock(lockedMessage(c));
      const problem =
        c === "not_found"
          ? t("errors.alreadyDecided")
          : c === "needs_correction"
            ? decision === "confirm"
              ? t("errors.needsTime")
              : t("errors.reasonNeeded")
            : c === "network"
              ? t("errors.saveFailed")
              : t("errors.generic");
      setRowError(shift.id, problem);
      if (c === "not_found") void refresh(session, dayRef.current);
    } finally {
      markBusy(shift.id, false);
    }
  };

  // Takes a decision back (within 24 hours): the shift is waiting again.
  const undo = async (shift: KitchenShift) => {
    if (!session || busyIds.has(shift.id)) return;
    markBusy(shift.id, true);
    setRowError(shift.id, null);
    const name = shift.volunteerName || t("volunteer");
    try {
      const backend = await withTimeout(loadBackend());
      const saved = await withTimeout(backend.undoDecision(slug, session.pin, shift.id));
      replaceRow(shift.id, saved);
      setAnnouncement(t("undoneAnnounce", { name }));
      void refresh(session, dayRef.current);
    } catch (err) {
      const c = errorCode(err);
      if (c === "bad_pin" || c === "locked") return lock(lockedMessage(c));
      setRowError(shift.id, c === "not_found" ? t("errors.undoExpired") : c === "network" ? t("errors.saveFailed") : t("errors.generic"));
      if (c === "not_found") void refresh(session, dayRef.current);
    } finally {
      markBusy(shift.id, false);
    }
  };

  const heading = (text: string) => (
    <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold break-words outline-none">
      {text}
    </h1>
  );

  const alertBox = (message: string | null | undefined) =>
    message ? (
      <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger">
        {message}
      </p>
    ) : null;

  if (!session) {
    return (
      <Screen>
        <div className="flex flex-col gap-1">
          <p className="text-lg text-text-muted">{t("eyebrow")}</p>
          {heading(t("unlockHeading"))}
        </div>
        <p className="text-lg leading-snug">{t("unlockIntro")}</p>
        <form method="post" onSubmit={unlock} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="kitchen-pin" className="text-lg font-semibold">
              {t("pinLabel")}
            </label>
            <input
              id="kitchen-pin"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              spellCheck={false}
              value={pinDraft}
              onChange={(e) => {
                setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                setUnlockError(null);
              }}
              className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-2xl tracking-[0.3em] text-text tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="kitchen-name" className="text-lg font-semibold">
              {t("nameLabel")}
            </label>
            <input
              id="kitchen-name"
              type="text"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setUnlockError(null);
              }}
              maxLength={40}
              autoComplete="given-name"
              autoCapitalize="words"
              aria-describedby="kitchen-name-hint"
              className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-xl text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
            />
            <p id="kitchen-name-hint" className="text-lg text-text-muted">
              {t("nameHint")}
            </p>
          </div>
          {alertBox(unlockError)}
          <button
            type="submit"
            disabled={!mounted || unlockBusy}
            className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
          >
            {unlockBusy ? t("unlocking") : t("unlock")}
          </button>
        </form>
      </Screen>
    );
  }

  const groups = shifts ? groupShifts(shifts) : null;
  const clock = (iso: string) => formatClock(locale, iso);
  const hoursText = (s: KitchenShift) => {
    const h = hoursOf(s);
    return h === null ? "" : t("hours", { hours: formatShiftHours(locale, h), n: h });
  };
  const rangeText = (s: KitchenShift) =>
    s.checkOut ? `${t("range", { start: clock(s.checkIn), end: clock(s.checkOut) })} · ${hoursText(s)}` : "";

  const section = (id: string, title: string, count: number, empty: string, rows: ReactNode) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-baseline justify-between gap-3 text-2xl font-semibold">
        <span>{title}</span>{" "}
        <span className="shrink-0 text-lg font-normal whitespace-nowrap text-text-muted">{t("count", { n: count })}</span>
      </h2>
      {count === 0 ? <p className="text-lg text-text-muted">{empty}</p> : <ul className="flex flex-col gap-3">{rows}</ul>}
    </section>
  );

  const nameLine = (s: KitchenShift) => (
    <p className="text-xl font-semibold break-words">{s.volunteerName || t("volunteer")}</p>
  );

  const waitingRow = (s: KitchenShift, fromEarlierDay = false) => {
    const d = draftOf(s.id);
    const why = endTimeReason(s);
    const busy = busyIds.has(s.id);
    const name = s.volunteerName || t("volunteer");
    const endId = `end-${s.id}`;
    return (
      <li
        key={s.id}
        data-testid={fromEarlierDay ? "earlier-row" : "waiting-row"}
        className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4"
      >
        {fromEarlierDay && <p className="text-lg font-semibold text-text-muted">{formatShiftDate(locale, s.checkIn)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {nameLine(s)}
          {why && (
            <span className="rounded-full border-2 border-pace px-3 py-0.5 text-base font-semibold" data-testid="badge">
              {why === "autoClosed" ? t("autoClosedBadge") : t("overLimitBadge")}
            </span>
          )}
        </div>
        <p className="text-lg tabular-nums">{rangeText(s)}</p>
        {why && (
          <div className="flex flex-col gap-2">
            <label htmlFor={endId} className="text-lg font-semibold">
              {t("endTimeLabel")}
            </label>
            <p id={`${endId}-hint`} className="text-lg leading-snug text-text-muted">
              {why === "autoClosed" ? t("endTimeHintAutoClosed") : t("endTimeHintOverLimit")}
            </p>
            <input
              id={endId}
              type="time"
              value={d.endTime}
              onChange={(e) => setDraft(s.id, { endTime: e.target.value })}
              aria-describedby={`${endId}-hint`}
              className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-xl text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
            />
          </div>
        )}
        {alertBox(rowErrors[s.id])}
        {d.mode === "idle" ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              aria-label={t("confirmFor", { name })}
              onClick={() => void decide(s, "confirm")}
              className={buttonClasses({ variant: "strong", size: "lg", className: "px-3" })}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={t("rejectFor", { name })}
              onClick={() => setDraft(s.id, { mode: "reject" })}
              className={buttonClasses({ size: "lg", className: "px-3" })}
            >
              {t("reject")}
            </button>
          </div>
        ) : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-lg font-semibold">{t("rejectPrompt")}</legend>
            <div className="flex flex-wrap gap-2">
              {(["didntWork", "wrongTimes", "other"] as const).map((c) => (
                <label
                  key={c}
                  className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-border bg-surface-2 px-4 text-lg font-semibold has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal"
                >
                  <input
                    type="radio"
                    name={`reason-${s.id}`}
                    value={c}
                    checked={d.reason === c}
                    onChange={() => setDraft(s.id, { reason: c })}
                    className="sr-only"
                  />
                  {t(`reasons.${c}`)}
                </label>
              ))}
            </div>
            {d.reason === "other" && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`other-${s.id}`} className="text-lg font-semibold">
                  {t("otherLabel")}
                </label>
                <input
                  id={`other-${s.id}`}
                  type="text"
                  value={d.other}
                  maxLength={280}
                  onChange={(e) => setDraft(s.id, { other: e.target.value })}
                  className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-xl text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy || rejectReason(d.reason, d.other, (c) => t(`reasons.${c}`)).ok === false}
                onClick={() => void decide(s, "reject")}
                className={buttonClasses({ variant: "strong", size: "lg", className: "px-3" })}
              >
                {t("rejectSubmit")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(s.id, { mode: "idle", reason: null, other: "" })}
                className={buttonClasses({ size: "lg", className: "px-3" })}
              >
                {t("cancel")}
              </button>
            </div>
          </fieldset>
        )}
      </li>
    );
  };

  const nowRow = (s: KitchenShift) => {
    const { h, m } = elapsedParts(s.checkIn, now);
    return (
      <li key={s.id} data-testid="now-row" className="flex flex-col gap-1 rounded-2xl border-2 border-proof bg-surface p-4">
        {nameLine(s)}
        <p className="text-lg tabular-nums">
          {t("since", { time: clock(s.checkIn) })} · {h > 0 ? t("elapsedHours", { h, m }) : t("elapsedMinutes", { m })}
        </p>
      </li>
    );
  };

  const doneRow = (s: KitchenShift) => (
    <li key={s.id} data-testid="done-row" className="flex flex-col gap-1 rounded-2xl border-2 border-border bg-surface-2 p-4">
      {nameLine(s)}
      <p className="text-lg tabular-nums">{rangeText(s)}</p>
      {s.status === "confirmed" ? (
        <p className="text-lg font-semibold text-proof">{t("confirmedBy", { name: s.confirmedBy ?? "" })}</p>
      ) : (
        <p className="text-lg font-semibold break-words text-danger">
          {t("rejectedBy", { name: s.confirmedBy ?? "", reason: s.reason ?? "" })}
        </p>
      )}
      {alertBox(rowErrors[s.id])}
      {canUndo(s, now) && (
        <button
          type="button"
          disabled={busyIds.has(s.id)}
          aria-label={t("undoFor", { name: s.volunteerName || t("volunteer") })}
          onClick={() => void undo(s)}
          className="mt-2 min-h-12 self-start rounded-2xl border-2 border-border bg-surface px-4 text-lg font-semibold"
        >
          {t("undo")}
        </button>
      )}
    </li>
  );

  // Earlier days' waiting shifts not already in the list below (a picked day in range).
  const shownIds = new Set(shifts?.map((s) => s.id) ?? []);
  const earlierWaiting = earlier.filter((s) => s.status === "pending" && !shownIds.has(s.id));
  const today = dayDate("today", new Date(now));
  const pickedDate = day !== "today" && day !== "yesterday" ? day : null;

  const dayButton = (key: DayKey) => (
    <button
      type="button"
      aria-pressed={day === key}
      onClick={() => switchDay(key)}
      className={buttonClasses({ variant: day === key ? "strong" : "primary", className: "px-3" })}
    >
      {t(key)}
    </button>
  );

  return (
    <Screen>
      <div className="flex flex-col gap-1">
        {kitchenName && <p className="text-lg text-text-muted">{t("title")}</p>}
        {heading(kitchenName ?? t("title"))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface py-2 pr-2 pl-4">
        <p className="min-w-0 flex-1 text-lg font-semibold break-words">{t("signedInAs", { name: session.name })}</p>
        <button
          type="button"
          onClick={() => lock()}
          className="min-h-12 shrink-0 rounded-2xl border-2 border-border bg-surface-2 px-4 text-lg font-semibold"
        >
          {t("lock")}
        </button>
      </div>
      {earlierWaiting.length > 0 && (
        <section aria-labelledby="earlier-heading" className="flex flex-col gap-3 rounded-2xl border-2 border-pace p-3">
          <h2 id="earlier-heading" className="flex items-baseline justify-between gap-3 text-2xl font-semibold">
            <span>{t("earlierHeading")}</span>{" "}
            <span className="shrink-0 text-lg font-normal whitespace-nowrap text-text-muted">
              {t("count", { n: earlierWaiting.length })}
            </span>
          </h2>
          <p className="text-lg leading-snug">{t("earlierIntro")}</p>
          <ul className="flex flex-col gap-3">{earlierWaiting.map((s) => waitingRow(s, true))}</ul>
        </section>
      )}
      <div role="group" aria-label={t("dayGroup")} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {dayButton("yesterday")}
          {dayButton("today")}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="other-day" className="text-lg font-semibold">
            {t("otherDay")}
          </label>
          <input
            id="other-day"
            type="date"
            max={today}
            value={pickedDate ?? ""}
            onChange={(e) => {
              const next = pickedDay(e.target.value, new Date());
              if (next) switchDay(next);
            }}
            className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-xl text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
          />
        </div>
      </div>
      {pickedDate && (
        <p className="text-xl font-semibold" data-testid="showing-day">
          {t("showingDay", { date: formatDayDate(locale, pickedDate) })}
        </p>
      )}
      <p role="status" className="text-base text-text-muted" data-testid="updated">
        {refreshFailed && updatedAt
          ? t("refreshFailed", { time: formatClock(locale, new Date(updatedAt).toISOString()) })
          : updatedAt && groups
            ? t("updatedAt", { time: formatClock(locale, new Date(updatedAt).toISOString()) })
            : t("loading")}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {groups && (
        <>
          {section("waiting-heading", t("waitingHeading"), groups.waiting.length, t("emptyWaiting"), groups.waiting.map((s) => waitingRow(s)))}
          {section("now-heading", t("nowHeading"), groups.now.length, t("emptyNow"), groups.now.map(nowRow))}
          {section("done-heading", t("doneHeading"), groups.done.length, t("emptyDone"), groups.done.map(doneRow))}
        </>
      )}
      <Link
        href={`/kitchen/${encodeURIComponent(slug)}/poster`}
        className={buttonClasses({ size: "lg", fullWidth: true })}
      >
        {t("posterLink")}
      </Link>
    </Screen>
  );
}
