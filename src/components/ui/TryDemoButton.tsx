"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonClasses } from "./Button";
import { californiaDate } from "@/lib/dates";
import { getMode, startDemo } from "@/lib/hours/store";

// "Try the demo" needs IndexedDB, which only exists in the browser, so this button must never
// render at module scope on the server and must never be imported outside a client component.
// With JavaScript off, the button never appears (ready stays false forever) and a <noscript>
// note explains why, in place of a dead button. With JavaScript on, the effect flips `ready`
// to true right after the first paint, which matches the server-rendered noscript-only markup
// on hydration (no mismatch) and then reveals the real button.
export function TryDemoButton() {
  const t = useTranslations("home");
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <noscript>
        <p className="text-center text-lg text-text-muted">{t("demoNeedsJs")}</p>
      </noscript>
    );
  }

  const handleClick = async () => {
    setStarting(true);
    setStorageBlocked(false);
    try {
      await startDemo(californiaDate());
    } catch {
      // Checked below: without the demo flag, /log would open the person's real hours.
    }
    // Demo mode is a flag in sessionStorage. If the browser blocks site storage the flag
    // never sticks, and /log would show the real log instead of the demo, so stay here and
    // say why.
    if (getMode() !== "demo") {
      setStorageBlocked(true);
      setStarting(false);
      return;
    }
    router.push("/log");
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={starting}
        className={buttonClasses({ variant: "ghost", size: "lg", fullWidth: true })}
      >
        {t("tryDemo")}
      </button>
      {storageBlocked && (
        <p role="alert" className="text-center text-lg font-semibold text-danger">
          {t("demoNeedsStorage")}
        </p>
      )}
    </>
  );
}
