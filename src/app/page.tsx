"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { Button, buttonClasses } from "@/components/ui/Button";

function setLocaleCookie(locale: "en" | "es") {
  try {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
  } catch {
    // Cookies may be blocked (e.g. private mode). Locale just won't persist across reloads.
  }
}

export default function Home() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("common");
  const ht = useTranslations("home");

  const selectLocale = (next: "en" | "es") => {
    if (next === locale) return;
    setLocaleCookie(next);
    router.refresh();
  };

  return (
    <Screen>
      <div className="flex gap-3">
        <Button
          variant={locale === "en" ? "primary" : "ghost"}
          aria-pressed={locale === "en"}
          onClick={() => selectLocale("en")}
        >
          {t("english")}
        </Button>
        <Button
          variant={locale === "es" ? "primary" : "ghost"}
          aria-pressed={locale === "es"}
          onClick={() => selectLocale("es")}
        >
          {t("spanish")}
        </Button>
      </div>

      <h1 className="font-display text-3xl font-semibold">{ht("title")}</h1>
      <p className="text-lg text-text-muted">{ht("subtitle")}</p>

      <Link href="/screener" className={buttonClasses({ size: "lg", fullWidth: true })}>
        {ht("cta")}
      </Link>
    </Screen>
  );
}
