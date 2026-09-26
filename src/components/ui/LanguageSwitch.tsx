"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions";

const LOCALES = [
  { code: "en", short: "EN", labelKey: "switchToEn" },
  { code: "es", short: "ES", labelKey: "switchToEs" },
] as const;

// Compact EN | ES switch for the header. It is a real <form> posting to a Server Action,
// so it also works before hydration and with JavaScript off.
export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("language");

  return (
    <form action={setLocale} aria-label={t("label")} className="flex items-center gap-1">
      <input type="hidden" name="returnTo" value={pathname || "/"} />
      {LOCALES.map(({ code, short, labelKey }, i) => {
        const current = locale === code;
        return (
          <Fragment key={code}>
            {i > 0 && (
              <span aria-hidden="true" className="text-lg text-text-muted">
                |
              </span>
            )}
            <button
              type="submit"
              name="locale"
              value={code}
              lang={code}
              aria-label={t(labelKey)}
              aria-current={current ? "true" : undefined}
              className={
                "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full px-2 text-lg font-semibold " +
                (current
                  ? "border-2 border-border bg-surface-2 text-text"
                  : "text-text-muted underline decoration-2 underline-offset-4")
              }
            >
              {short}
            </button>
          </Fragment>
        );
      })}
    </form>
  );
}
