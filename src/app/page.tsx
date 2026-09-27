import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Screen } from "@/components/ui/Screen";
import { buttonClasses } from "@/components/ui/Button";
import { NoScriptNotice } from "@/components/ui/NoScriptNotice";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { TryDemoButton } from "@/components/ui/TryDemoButton";
import { ruleSet } from "@/lib/rules/load";
import { setLocale } from "./actions";

// A Server Component: the language choice is a plain <form> posting to a Server Action,
// so it works before hydration and with JavaScript off. The rules (and zod) stay on the
// server; only the county block is used here.
export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations("common");
  const ht = await getTranslations("home");

  return (
    <>
      <NoScriptNotice county={ruleSet.county} />
      <Screen languageSwitch={false} banner={<DemoBanner />}>
        <form action={setLocale} className="flex gap-3">
          <input type="hidden" name="returnTo" value="/" />
          <button
            type="submit"
            name="locale"
            value="en"
            lang="en"
            aria-pressed={locale === "en"}
            className={buttonClasses({ variant: locale === "en" ? "primary" : "ghost" })}
          >
            {t("english")}
          </button>
          <button
            type="submit"
            name="locale"
            value="es"
            lang="es"
            aria-pressed={locale === "es"}
            className={buttonClasses({ variant: locale === "es" ? "primary" : "ghost" })}
          >
            {t("spanish")}
          </button>
        </form>

        <h1 className="font-display text-3xl font-semibold">{ht("title")}</h1>
        <p className="text-lg text-text-muted">{ht("subtitle")}</p>

        {/* Three entry points, in order of what most people need: check the rule first,
            track hours if that's already settled, or see the whole story with sample data. */}
        <div className="flex flex-col gap-3">
          <Link href="/screener" className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}>
            {ht("cta")}
          </Link>
          <Link href="/log" className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
            {ht("trackHours")}
          </Link>
          <TryDemoButton />
        </div>
      </Screen>
    </>
  );
}
