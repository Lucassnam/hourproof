"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { exitDemo, getMode } from "@/lib/hours/store";

// A pace-toned bar at the very top of the page while "Try the demo" is on, so sample data is
// never mistaken for the person's own hours. The mode lives in sessionStorage, which only
// exists in the browser, so the bar appears after mount (never in the server HTML).
export function DemoBanner() {
  const t = useTranslations("demo");
  const router = useRouter();
  const [isDemo, setIsDemo] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setIsDemo(getMode() === "demo");
  }, []);

  if (!isDemo) return null;

  const handleExit = async () => {
    setLeaving(true);
    try {
      await exitDemo();
    } finally {
      // Even if clearing the demo database failed, the mode flag is what decides which
      // data shows, so going home is still safe.
      setIsDemo(false);
      router.push("/");
    }
  };

  return (
    <div role="region" aria-label={t("banner")} className="bg-pace text-bg print:hidden">
      {/* Wraps: the Spanish button label is too long to sit beside the text at 360px. */}
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2">
        <p className="min-w-40 flex-1 text-lg font-semibold">{t("banner")}</p>
        <button
          type="button"
          onClick={handleExit}
          disabled={leaving}
          className="min-h-12 max-w-full rounded-2xl border-2 border-bg px-4 text-lg font-semibold"
        >
          {t("exit")}
        </button>
      </div>
    </div>
  );
}
