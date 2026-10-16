"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { loadBackend, withTimeout } from "@/lib/shifts/client-backend";

// On the check-in page, under a check-in or check-out: a one-time code that lets another
// browser on this phone see this browser's kitchen shifts. On iPhone the camera opens the
// poster in Safari, and HourProof added to the Home Screen has its own storage, so without
// this the Home Screen app never shows a kitchen shift. The other browser types the code
// in its hour log (src/app/log/LinkDevice.tsx); use_link_code joins the two.
//
// Collapsed by default: most people use one browser and never need it.
export function LinkCodeOffer() {
  const t = useTranslations("checkin.link");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const getCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const backend = await withTimeout(loadBackend());
      const made = await withTimeout(backend.makeLinkCode());
      setCode(made.code);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group rounded-2xl border-2 border-border bg-surface" data-testid="link-offer">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        <span>{t("title")}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-lg leading-snug">{t("why")}</p>
        {code ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-lg font-semibold">{t("codeLabel")}</p>
            {/* Shown in two groups of four so it's easy to read off and type. */}
            <p className="font-mono text-4xl font-semibold tracking-[0.2em] tabular-nums" data-testid="link-code" aria-label={code.split("").join(" ")}>
              {code.slice(0, 4)} {code.slice(4)}
            </p>
            <p className="text-lg leading-snug">{t("how")}</p>
          </div>
        ) : (
          <button type="button" onClick={() => void getCode()} disabled={busy} className={buttonClasses({ size: "lg", fullWidth: true })}>
            {busy ? t("getting") : t("get")}
          </button>
        )}
        {error && (
          <p role="alert" className="text-lg font-semibold text-danger">
            {t("error")}
          </p>
        )}
      </div>
    </details>
  );
}
