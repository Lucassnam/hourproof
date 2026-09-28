"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { buttonClasses } from "@/components/ui/Button";
import { safeGet } from "@/lib/storage/safe";
import { withTimeout } from "@/lib/shifts/client-backend";
import type { BackendErrorCode } from "@/lib/shifts/types";
import { loadPoster, rotatePoster, type PosterResult } from "./actions";

export type PrintedText = { title: string; steps: string[]; typeAddress: string };

type Shown = Extract<PosterResult, { ok: true }>;

// Mock backend only (dev and e2e): the namespace the mock client uses, so the server action
// reads and rotates the same mock world as the dashboard and the volunteer's phone. The
// server ignores it unless the mock backend is on.
function mockNamespace(): string | null {
  return safeGet("local", "hp.shifts.mockNs");
}

// The poster screen. The PIN is kept in this component's state only while the poster is
// shown (so "Make a new code" doesn't ask again), and is sent only in server-action POST
// bodies. Printing drops everything but the poster itself (globals.css hides the header and
// buttons; the rest is marked print:hidden).
export function Poster({ slug, printed }: { slug: string; printed: { en: PrintedText; es: PrintedText } }) {
  const t = useTranslations("kitchen");
  const [mounted, setMounted] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pin, setPin] = useState<string | null>(null);
  const [poster, setPoster] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotated, setRotated] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setMounted(true), []);

  const message = (c: BackendErrorCode) =>
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
              : t("errors.generic");

  const shown = poster !== null;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [shown]);

  // A refused PIN (or a lockout) on rotate drops the poster and the PIN, back to the form.
  const settle = (r: PosterResult, usedPin: string) => {
    if (r.ok) {
      setPoster(r);
      setPin(usedPin);
      setPinDraft("");
      return true;
    }
    if (r.error === "bad_pin" || r.error === "locked") {
      setPoster(null);
      setPin(null);
    }
    setError(message(r.error));
    return false;
  };

  const show = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const entered = pinDraft.trim();
    if (!/^\d{6}$/.test(entered)) return setError(t("errors.pinFormat"));
    setBusy(true);
    setError(null);
    try {
      settle(await withTimeout(loadPoster(slug, entered, mockNamespace())), entered);
    } catch {
      setError(t("errors.network"));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (busy || !pin) return;
    setBusy(true);
    setError(null);
    try {
      if (settle(await withTimeout(rotatePoster(slug, pin, mockNamespace())), pin)) setRotated(true);
    } catch {
      setError(t("errors.network"));
    } finally {
      setBusy(false);
      setConfirmRotate(false);
    }
  };

  const heading = (text: string, className: string) => (
    <h1 ref={headingRef} tabIndex={-1} className={`font-display font-semibold break-words outline-none ${className}`}>
      {text}
    </h1>
  );

  const errorBox = error && (
    <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger print:hidden">
      {error}
    </p>
  );

  const back = (
    <Link
      href={`/kitchen/${encodeURIComponent(slug)}`}
      className={buttonClasses({ variant: "ghost", size: "md", fullWidth: true, className: "print:hidden" })}
    >
      {t("poster.back")}
    </Link>
  );

  if (!poster) {
    return (
      <Screen>
        <div className="flex flex-col gap-1">
          <p className="text-lg text-text-muted">{t("poster.title")}</p>
          {heading(t("poster.heading"), "text-3xl")}
        </div>
        <p className="text-lg leading-snug">{t("poster.intro")}</p>
        <form method="post" onSubmit={show} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="poster-pin" className="text-lg font-semibold">
              {t("pinLabel")}
            </label>
            <input
              id="poster-pin"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              spellCheck={false}
              value={pinDraft}
              onChange={(e) => {
                setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 text-2xl tracking-[0.3em] text-text tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
            />
          </div>
          {errorBox}
          <button
            type="submit"
            disabled={!mounted || busy}
            className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
          >
            {busy ? t("unlocking") : t("poster.show")}
          </button>
        </form>
        {back}
      </Screen>
    );
  }

  const block = (lang: "en" | "es") => (
    <div lang={lang} className="flex flex-col gap-1 text-left">
      {printed[lang].steps.map((step) => (
        <p key={step} className="text-xl leading-snug font-semibold print:text-[15pt]">
          {step}
        </p>
      ))}
    </div>
  );

  return (
    <Screen>
      {rotated && (
        <p role="status" className="rounded-2xl border-2 border-proof bg-surface px-4 py-3 text-lg font-semibold print:hidden">
          {t("poster.rotated")}
        </p>
      )}
      {errorBox}
      <button
        type="button"
        onClick={() => window.print()}
        className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
      >
        {t("poster.print")}
      </button>

      <article
        data-testid="poster"
        className="flex flex-col items-center gap-4 rounded-2xl border-2 border-border bg-surface p-4 text-center print:gap-5 print:border-0 print:p-0"
      >
        <p className="text-lg font-semibold text-text-muted print:text-[16pt]">
          <span lang="en">{printed.en.title}</span> · <span lang="es">{printed.es.title}</span>
        </p>
        {heading(poster.kitchenName, "text-3xl print:text-[28pt]")}
        <div
          role="img"
          aria-label={t("poster.qrLabel", { url: poster.url })}
          data-testid="qr"
          className="aspect-square w-full max-w-80 bg-white print:w-[13cm] print:max-w-none"
          dangerouslySetInnerHTML={{ __html: poster.svg }}
        />
        <div className="grid w-full grid-cols-1 gap-4 min-[480px]:grid-cols-2 print:grid-cols-2">
          {block("en")}
          {block("es")}
        </div>
        <div className="flex w-full flex-col gap-1">
          <p className="text-base text-text-muted">
            <span lang="en">{printed.en.typeAddress}</span> / <span lang="es">{printed.es.typeAddress}</span>
          </p>
          <p className="font-mono text-base break-all" data-testid="poster-url">
            {poster.url}
          </p>
        </div>
      </article>

      <div className="flex flex-col gap-3 print:hidden">
        {confirmRotate ? (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-pace bg-surface p-4">
            <p className="text-lg leading-snug font-semibold" data-testid="rotate-warning">
              {t("poster.rotateWarning")}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void rotate()}
              className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
            >
              {busy ? t("poster.rotating") : t("poster.rotateConfirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmRotate(false)}
              className={buttonClasses({ size: "lg", fullWidth: true })}
            >
              {t("cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRotated(false);
              setConfirmRotate(true);
            }}
            className={buttonClasses({ size: "lg", fullWidth: true })}
          >
            {t("poster.rotate")}
          </button>
        )}
        {back}
      </div>
    </Screen>
  );
}
