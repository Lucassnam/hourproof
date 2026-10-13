"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { backupFileName, makeBackup, parseBackup, restoreBackup } from "@/lib/hours/backup";
import type { EntryStore } from "@/lib/hours/store";
import { installAdvice, type InstallAdvice } from "@/lib/storage/persist";

// "Keep your hours safe", at the bottom of the hour log (never in the demo): save a copy of
// the hours as a file, put a copy back, and a hint about adding the app to the Home Screen.
// Everything happens on the phone; the copy goes wherever the person saves it.

// Chrome and some other browsers fire this when the site can be installed, usually soon
// after load and before this component mounts, so it's caught at module level and kept.
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
let installPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    promptListeners.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    promptListeners.forEach((notify) => notify());
  });
}

function currentAdvice(): InstallAdvice {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return installAdvice({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    canPrompt: installPrompt !== null,
  });
}

const button = "flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-border bg-surface-2 px-4 text-center text-lg font-semibold";

export function KeepSafe({ store, today, onRestored }: { store: EntryStore; today: string; onRestored: () => Promise<void> }) {
  const t = useTranslations("log.safe");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState<InstallAdvice>("none");

  useEffect(() => {
    const update = () => setAdvice(currentAdvice());
    update();
    promptListeners.add(update);
    return () => {
      promptListeners.delete(update);
    };
  }, []);

  const save = async () => {
    setStatus("");
    setError("");
    try {
      const backup = makeBackup(await store.list(), new Date());
      if (backup.entries.length === 0) {
        setStatus(t("nothingToSave"));
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName(today);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus(t("saved", { n: backup.entries.length }));
    } catch {
      setError(t("saveError"));
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setStatus("");
    setError("");
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        setError(t(parsed.error === "newer_version" ? "newerVersion" : "notABackup"));
        return;
      }
      const result = await restoreBackup(store, parsed.entries);
      await onRestored();
      const failed = result.failed + parsed.skipped;
      setStatus(
        [
          t("restored", { n: result.added }),
          result.alreadyHere > 0 ? t("restoredAlready", { n: result.alreadyHere }) : "",
          failed > 0 ? t("restoredFailed", { n: failed }) : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch {
      setError(t("notABackup"));
    }
  };

  return (
    <details className="group rounded-2xl border-2 border-border bg-surface" data-testid="keep-safe">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        <span>{t("title")}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-lg leading-snug">{t("why")}</p>
        <button type="button" onClick={save} className={button}>
          {t("save")}
        </button>
        {/* The label is the visible button; the input stays reachable by keyboard and
            screen readers (sr-only, not display:none), as on the proof page. */}
        <label className={button + " cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal"}>
          {t("restore")}
          <input
            type="file"
            accept="application/json,.json"
            aria-label={t("restoreLabel")}
            className="sr-only"
            onChange={async (e) => {
              const input = e.currentTarget;
              await restore(input.files?.[0]);
              input.value = "";
            }}
          />
        </label>
        <p role="status" className="text-lg font-semibold text-proof empty:hidden" data-testid="keep-safe-status">
          {status}
        </p>
        <p role="alert" className="text-lg font-semibold text-danger empty:hidden">
          {error}
        </p>
        <p className="text-lg leading-snug text-text-muted">{t("notIncluded")}</p>

        {advice === "ios" && (
          <div className="flex flex-col gap-2 border-t-2 border-border pt-3" data-testid="install-ios">
            <p className="text-lg font-semibold">{t("iosTitle")}</p>
            <p className="text-lg leading-snug">{t("ios")}</p>
            <p className="text-lg leading-snug text-text-muted">{t("iosMove")}</p>
          </div>
        )}
        {advice === "prompt" && (
          <div className="flex flex-col gap-2 border-t-2 border-border pt-3" data-testid="install-prompt">
            <button
              type="button"
              className={button}
              onClick={async () => {
                const prompt = installPrompt;
                installPrompt = null;
                setAdvice(currentAdvice());
                await prompt?.prompt();
              }}
            >
              {t("install")}
            </button>
            <p className="text-lg leading-snug text-text-muted">{t("installWhy")}</p>
          </div>
        )}
      </div>
    </details>
  );
}
