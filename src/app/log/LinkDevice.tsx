"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { safeSet } from "@/lib/storage/safe";
import { loadBackend, withTimeout } from "@/lib/shifts/client-backend";
import { CHECKIN_ACK_KEY } from "@/lib/shifts/local";

// "Kitchen hours from another browser", in the hour log (never in the demo). Takes the code
// from the check-in page (src/app/k/[code]/LinkCodeOffer.tsx) and links this browser to
// that one, so this log shows the kitchen shifts checked in there.
//
// Linking is the first time this browser talks to the server, so the privacy line sits
// above the button, as it does on the check-in page; after it works this browser counts as
// having checked in (CHECKIN_ACK_KEY), and the log starts asking for its kitchen shifts.
export function LinkDevice({ onLinked }: { onLinked: () => void }) {
  const t = useTranslations("log.link");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const code = draft.replace(/[\s-]/g, "").toUpperCase();
    setStatus("");
    if (code.length !== 8) return setError(t("badCode"));
    setBusy(true);
    setError("");
    try {
      const backend = await withTimeout(loadBackend());
      const result = await withTimeout(backend.useLinkCode(code));
      if (result === "ok") {
        safeSet("local", CHECKIN_ACK_KEY, new Date().toISOString());
        setDraft("");
        setStatus(t("ok"));
        onLinked();
      } else {
        setError(result === "locked" ? t("locked") : t("badCode"));
      }
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group rounded-2xl border-2 border-border bg-surface" data-testid="link-device">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        <span>{t("title")}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-3 px-4 pb-4" noValidate>
        <p className="text-lg leading-snug">{t("why")}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="link-code" className="text-lg font-semibold">
            {t("label")}
          </label>
          <input
            id="link-code"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.toUpperCase().slice(0, 12));
              setError("");
            }}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-h-14 w-full rounded-2xl border-2 border-border bg-surface px-4 font-mono text-2xl tracking-[0.2em] text-text uppercase outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
          />
        </div>
        <p className="text-lg leading-snug text-text-muted">{t("privacy")}</p>
        <button type="submit" disabled={busy || draft.trim() === ""} className={buttonClasses({ size: "lg", fullWidth: true })}>
          {busy ? t("linking") : t("submit")}
        </button>
        <p role="status" className="text-lg font-semibold text-proof empty:hidden">
          {status}
        </p>
        <p role="alert" className="text-lg font-semibold text-danger empty:hidden">
          {error}
        </p>
      </form>
    </details>
  );
}
