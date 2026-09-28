"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { buttonClasses } from "@/components/ui/Button";
import { safeGet, safeSet } from "@/lib/storage/safe";
import { ShiftBackendError, type BackendErrorCode, type KitchenInfo, type Shift, type ShiftBackend } from "@/lib/shifts/types";
import {
  deriveCheckin,
  elapsedParts,
  findLandedCheckOut,
  formatClock,
  formatShiftHours,
  lookbackDate,
  sentHours,
} from "./checkin-state";

// The volunteer's check-in screen, opened by the phone camera from a kitchen's QR poster.
// One screen, a few states. What leaves the phone is only what the privacy line says: the
// name typed here and the check-in/check-out times at this kitchen. The page never asks the
// backend about this device's shifts until the volunteer has checked in once (with the
// privacy line in front of them), so a first visit sends nothing but the poster's code.

const NAME_KEY = "hp.checkin.name";
// Set on the first check-in tap that the server accepted on this device: the volunteer saw
// the privacy line and "Tapping Check in means you agree." and tapped. Holds the time of that
// agreement (ISO), kept only on this phone. Older builds stored "1"; any value counts.
const ACK_KEY = "hp.checkin.privacyShown";
// The id of the auto-closed shift whose notice this device already moved past.
const AUTO_CLOSED_SEEN_KEY = "hp.checkin.autoClosedSeen";

const TICK_MS = 30_000;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1f\x7f]/;
function nameProblem(name: string): boolean {
  return name.length < 1 || name.length > 40 || CONTROL_CHAR.test(name);
}

// The backend module (and, behind it, the Supabase or mock client) loads only on this
// page, and only after it mounts.
let backendPromise: Promise<ShiftBackend> | null = null;
function loadBackend(): Promise<ShiftBackend> {
  backendPromise ??= import("@/lib/shifts/backend")
    .then((m) => m.getShiftBackend())
    .catch((err) => {
      backendPromise = null; // a failed chunk load (no signal) can be retried
      throw err;
    });
  return backendPromise;
}

// Weak signal can leave a request hanging for minutes with the button stuck on
// "Checking in…". After this long the page gives up and says there's no signal. If the
// request did land after all, trying again is safe: check-in is idempotent, and a repeated
// check-out finds nothing open and shows the current state.
const REQUEST_TIMEOUT_MS = 20_000;
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new ShiftBackendError("network", "timeout")), REQUEST_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Anything that isn't a backend error (a chunk that couldn't load, a dropped connection)
// is treated as no signal.
function errorCode(err: unknown): BackendErrorCode {
  return err instanceof ShiftBackendError ? err.code : "network";
}

type View =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "unavailable" }
  | { kind: "loadError"; code: BackendErrorCode }
  | { kind: "ready"; kitchen: KitchenInfo; open: Shift | null; autoClosed: Shift | null }
  | { kind: "elsewhere"; other: Shift }
  | { kind: "out"; kitchen: KitchenInfo; shift: Shift };

export function CheckIn({ code }: { code: string }) {
  const t = useTranslations("checkin");
  const locale = useLocale();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [firstTime, setFirstTime] = useState(true);
  const [savedName, setSavedName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const errorText = useCallback(
    (c: BackendErrorCode) =>
      c === "network"
        ? t("errors.network")
        : c === "bad_name"
          ? t("errors.badName")
          : c === "not_checked_in"
            ? t("errors.notCheckedIn")
            : t("errors.generic"),
    [t],
  );

  // Reads this device's state from the backend. `showLoading` is false for a quiet refresh
  // after an action, so the screen doesn't flash back to "Loading".
  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setView({ kind: "loading" });
      const hasCheckedInHere = Boolean(safeGet("local", ACK_KEY));
      setFirstTime(!hasCheckedInHere);
      try {
        const backend = await withTimeout(loadBackend());
        if (backend.kind === "unavailable") return setView({ kind: "unavailable" });
        const kitchen = await withTimeout(backend.kitchenByCode(code));
        if (!kitchen) return setView({ kind: "unknown" });
        // A device that never checked in has no shifts: don't ask (and, with Supabase,
        // don't create an anonymous session) before the volunteer has seen the privacy line.
        if (!hasCheckedInHere) return setView({ kind: "ready", kitchen, open: null, autoClosed: null });
        const shifts = await withTimeout(backend.myShifts(lookbackDate()));
        const derived = deriveCheckin(kitchen.id, shifts, safeGet("local", AUTO_CLOSED_SEEN_KEY));
        if (derived.elsewhere) return setView({ kind: "elsewhere", other: derived.elsewhere });
        setNow(Date.now());
        setView({ kind: "ready", kitchen, open: derived.open, autoClosed: derived.autoClosed });
      } catch (err) {
        const c = errorCode(err);
        if (c === "unavailable") setView({ kind: "unavailable" });
        else if (c === "not_found") setView({ kind: "unknown" });
        else setView({ kind: "loadError", code: c });
      }
    },
    [code],
  );

  useEffect(() => {
    const name = safeGet("local", NAME_KEY) ?? "";
    setSavedName(name);
    setNameDraft(name);
    void load();
  }, [load]);

  const isIn = view.kind === "ready" && view.open !== null;

  // The live elapsed counter: every 30 s, and right away when the phone comes back to the page.
  useEffect(() => {
    if (!isIn) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isIn]);

  // Screen reader and keyboard users land on the new heading whenever the screen changes
  // (not on the very first render, which is the page load itself).
  const screenKey =
    view.kind === "ready" ? (view.open ? "in" : firstTime ? "first" : "notIn") : view.kind;
  const shownScreen = useRef(screenKey);
  useEffect(() => {
    if (shownScreen.current === screenKey) return;
    shownScreen.current = screenKey;
    headingRef.current?.focus();
  }, [screenKey]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const askingName = firstTime || editingName || savedName.trim() === "";
  const name = (askingName ? nameDraft : savedName).trim();

  const checkIn = async (e: FormEvent) => {
    e.preventDefault();
    if (view.kind !== "ready" || busy) return;
    if (nameProblem(name)) return setError(t("errors.badName"));
    setBusy(true);
    setError(null);
    try {
      const backend = await withTimeout(loadBackend());
      const shift = await withTimeout(backend.checkIn(code, name));
      safeSet("local", NAME_KEY, name);
      if (!safeGet("local", ACK_KEY)) safeSet("local", ACK_KEY, new Date().toISOString());
      if (view.autoClosed) safeSet("local", AUTO_CLOSED_SEEN_KEY, view.autoClosed.id);
      setSavedName(name);
      setNameDraft(name);
      setEditingName(false);
      setFirstTime(false);
      setNow(Date.now());
      setView({ kind: "ready", kitchen: view.kitchen, open: shift, autoClosed: null });
    } catch (err) {
      const c = errorCode(err);
      if (c === "already_open_elsewhere") {
        // The volunteer has checked in before (maybe on this device before its storage was
        // cleared); the refresh finds the open shift and shows where.
        if (!safeGet("local", ACK_KEY)) safeSet("local", ACK_KEY, new Date().toISOString());
        await load(false);
      } else if (c === "unavailable") setView({ kind: "unavailable" });
      else if (c === "not_found") setView({ kind: "unknown" });
      else setError(errorText(c));
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    if (view.kind !== "ready" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const backend = await withTimeout(loadBackend());
      const shift = await withTimeout(backend.checkOut(code));
      setView({ kind: "out", kitchen: view.kitchen, shift });
    } catch (err) {
      const c = errorCode(err);
      if (c === "not_checked_in") {
        // Nothing open here any more. Most often this is our own check-out landing after the
        // page gave up on it (weak signal, then a retry): find that shift and show its real
        // summary. Otherwise (auto-closed, closed on another tab) show what's true now.
        const landed = await findLanded(view.kitchen.id, view.open?.checkIn ?? null);
        if (landed) setView({ kind: "out", kitchen: view.kitchen, shift: landed });
        else {
          await load(false);
          setError(errorText(c));
        }
      } else if (c === "unavailable") setView({ kind: "unavailable" });
      else setError(errorText(c));
    } finally {
      setBusy(false);
    }
  };

  const findLanded = async (kitchenId: string, openCheckIn: string | null): Promise<Shift | null> => {
    try {
      const backend = await withTimeout(loadBackend());
      const shifts = await withTimeout(backend.myShifts(lookbackDate()));
      return findLandedCheckOut(kitchenId, openCheckIn, shifts, Date.now());
    } catch {
      return null;
    }
  };

  const heading = (text: string) => (
    <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold break-words outline-none">
      {text}
    </h1>
  );

  const errorBox = error && (
    <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger">
      {error}
    </p>
  );

  const seeHours = (variant: "strong" | "primary") => (
    <Link href="/log" className={buttonClasses({ variant, size: "lg", fullWidth: true })}>
      {t("seeHours")}
    </Link>
  );

  let body: ReactNode;
  switch (view.kind) {
    case "loading":
      body = (
        <>
          {heading(t("loadingHeading"))}
          <p role="status" className="text-lg text-text-muted">
            {t("loading")}
          </p>
        </>
      );
      break;

    case "unknown":
      body = (
        <>
          {heading(t("unknownHeading"))}
          <p className="text-xl leading-snug">{t("unknownBody")}</p>
        </>
      );
      break;

    case "unavailable":
      body = (
        <>
          {heading(t("unavailableHeading"))}
          <p className="text-xl leading-snug">{t("unavailableBody")}</p>
          {seeHours("primary")}
        </>
      );
      break;

    case "loadError":
      body = (
        <>
          {heading(t("loadingHeading"))}
          <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger">
            {errorText(view.code)}
          </p>
          <button type="button" onClick={() => void load()} className={buttonClasses({ size: "lg", fullWidth: true })}>
            {t("tryAgain")}
          </button>
        </>
      );
      break;

    case "elsewhere":
      body = (
        <>
          {heading(t("elsewhereHeading"))}
          <p className="text-xl leading-snug break-words">{t("elsewhere", { other: view.other.kitchenName })}</p>
          {seeHours("primary")}
        </>
      );
      break;

    case "out": {
      const hours = sentHours(view.shift);
      const range = {
        start: formatClock(locale, view.shift.checkIn),
        end: view.shift.checkOut ? formatClock(locale, view.shift.checkOut) : "",
      };
      body = (
        <>
          {heading(t("checkedOutHeading"))}
          <p className="text-xl leading-snug font-semibold break-words" data-testid="sent">
            {t("sent", { kitchen: view.kitchen.name, hours: formatShiftHours(locale, hours), n: hours, ...range })}
          </p>
          {view.shift.autoClosed && <AutoClosedNote text={t("autoClosed")} />}
          <p className="text-lg leading-snug text-text-muted">{t("sentNote")}</p>
          {seeHours("strong")}
        </>
      );
      break;
    }

    case "ready": {
      const kitchenName = view.kitchen.name;
      if (view.open) {
        const { h, m } = elapsedParts(view.open.checkIn, now);
        body = (
          <>
            {heading(t("checkedInHeading"))}
            <p className="-mt-3 text-xl font-semibold break-words">{kitchenName}</p>
            <div className="flex flex-col gap-1 rounded-2xl border-2 border-proof bg-surface p-4">
              <p className="text-xl font-semibold" data-testid="checked-in-at">
                {t("checkedInAt", { time: formatClock(locale, view.open.checkIn) })}
              </p>
              <p className="text-lg tabular-nums text-text-muted" data-testid="elapsed">
                {h > 0 ? t("elapsedHours", { h, m }) : t("elapsedMinutes", { m })}
              </p>
            </div>
            {errorBox}
            <button
              type="button"
              onClick={() => void checkOut()}
              disabled={busy}
              className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
            >
              {busy ? t("checkingOut") : t("checkOut")}
            </button>
            <p className="-mt-3 text-center text-lg text-text-muted">{t("checkOutHint")}</p>
          </>
        );
        break;
      }

      const privacy = <p className="text-lg leading-snug" data-testid="privacy">{t("privacy", { kitchen: kitchenName })}</p>;
      body = (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-lg text-text-muted">{t("eyebrow")}</p>
            {heading(kitchenName)}
          </div>
          {view.autoClosed && <AutoClosedNote text={t("autoClosed")} />}
          <form onSubmit={checkIn} className="flex flex-col gap-4" noValidate>
            {askingName ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="checkin-name" className="text-lg font-semibold">
                  {t("nameLabel")}
                </label>
                <input
                  ref={nameInputRef}
                  id="checkin-name"
                  type="text"
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setError(null);
                  }}
                  maxLength={40}
                  autoComplete="nickname"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-xl text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface py-2 pr-2 pl-4">
                <p className="min-w-0 flex-1 text-lg font-semibold break-words">{t("checkingInAs", { name: savedName })}</p>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="min-h-12 shrink-0 rounded-2xl border-2 border-border bg-surface-2 px-4 text-lg font-semibold"
                >
                  {t("changeName")}
                </button>
              </div>
            )}
            {/* Before the first check-in on this device, the privacy line and the consent
                sentence sit right above the button: tapping it is the agreement. */}
            {firstTime && (
              <div className="flex flex-col gap-2">
                {privacy}
                <p className="text-lg leading-snug font-semibold" data-testid="consent">
                  {t("consent")}
                </p>
              </div>
            )}
            {errorBox}
            <button
              type="submit"
              disabled={busy || name === ""}
              className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true, className: "py-3" })}
            >
              {busy ? t("checkingIn") : t("checkIn", { kitchen: kitchenName })}
            </button>
            {!firstTime && <div className="text-text-muted">{privacy}</div>}
          </form>
        </>
      );
      break;
    }
  }

  return <Screen>{body}</Screen>;
}

function AutoClosedNote({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border-2 border-pace bg-surface px-4 py-3 text-lg leading-snug font-semibold" data-testid="auto-closed">
      {text}
    </p>
  );
}
