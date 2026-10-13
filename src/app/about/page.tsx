import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Screen } from "@/components/ui/Screen";
import { ruleSet } from "@/lib/rules/load";
import { AI_USE_URL, ISSUES_URL, REPO_URL, contactEmail } from "@/lib/site";
import { telHref } from "@/lib/tel";

// What HourProof is, who made it, and how to reach them. Every statement here is checked
// against the code or the rules file: see src/lib/site.ts, and the review status comes
// straight from rules/ca-calfresh-2026.json (the same field that gates "likely exempt").

const link = "flex min-h-12 items-center self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="font-display text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  const locale = await getLocale();
  const email = contactEmail();
  const reviewedOn = ruleSet.reviewedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${ruleSet.reviewedAt}T00:00:00Z`))
    : null;

  return (
    <Screen>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="-mt-2 text-lg leading-snug">{t("what")}</p>

      <Section id="about-not-gov" title={t("notGovTitle")}>
        <p className="text-lg leading-snug">{t("notGov")}</p>
      </Section>

      <Section id="about-rules" title={t("rulesTitle")}>
        <p className="text-lg leading-snug">{t("rules")}</p>
        <p className="text-lg leading-snug" data-testid="rules-review">
          {ruleSet.reviewer && reviewedOn ? t("reviewed", { reviewer: ruleSet.reviewer, date: reviewedOn }) : t("notReviewed")}
        </p>
        <a href={ruleSet.generalSourceUrl} target="_blank" rel="noopener" className={link}>
          {t("rulesLink")}
        </a>
      </Section>

      <Section id="about-who" title={t("whoTitle")}>
        <p className="text-lg leading-snug">{t("who")}</p>
        <p className="text-lg leading-snug">{t("ai")}</p>
        <p className="text-lg leading-snug">{t("spanish")}</p>
        <a href={REPO_URL} target="_blank" rel="noopener" className={link}>
          {t("codeLink")}
        </a>
        <a href={AI_USE_URL} target="_blank" rel="noopener" className={link}>
          {t("aiLink")}
        </a>
      </Section>

      <Section id="contact" title={t("contactTitle")}>
        <p className="text-lg leading-snug">{t("contactBenefits", { county: ruleSet.county.name })}</p>
        <a href={telHref(ruleSet.county.phone)} className={link + " whitespace-nowrap"}>
          {ruleSet.county.phone}
        </a>
        <p className="text-lg leading-snug">{t("contactApp")}</p>
        {email ? (
          <a href={`mailto:${email}`} className={link} data-testid="contact-email">
            {t("contactEmail", { email })}
          </a>
        ) : (
          <a href={ISSUES_URL} target="_blank" rel="noopener" className={link} data-testid="contact-github">
            {t("contactGithub")}
          </a>
        )}
      </Section>

      <footer className="mt-2 flex flex-col gap-1 border-t-2 border-border pt-4">
        <a href="/privacy" className={link}>
          {t("privacyLink")}
        </a>
        <a href="/" className={link}>
          {t("home")}
        </a>
      </footer>
    </Screen>
  );
}
