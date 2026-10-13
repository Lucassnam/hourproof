import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Screen } from "@/components/ui/Screen";

// What HourProof keeps, where, and what it sends. Each line describes what the code does:
//   on the phone   sessionStorage `hp.screener`; IndexedDB `hourproof` and `hourproof-proof`;
//                  the CF 888 form's fields live only in React state (src/app/proof)
//   sent           the NEXT_LOCALE cookie (src/app/actions.ts); the check_in / check_out /
//                  my_shifts / decide_shift RPCs (src/lib/shifts/supabase.ts)
//   never          no analytics or ad code is in the project; nothing reads location
// If any of that changes, this page (messages/*.json, "privacy") has to change with it, and
// so does the "Last updated" date.

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

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-6">
      {items.map((item) => (
        <li key={item} className="text-lg leading-snug">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <Screen>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="-mt-2 text-lg font-semibold leading-snug">{t("short")}</p>

      <Section id="privacy-on-phone" title={t("onPhoneTitle")}>
        <List items={[t("onPhone1"), t("onPhone2"), t("onPhone3"), t("onPhone4"), t("onPhone5")]} />
        <p className="text-lg leading-snug text-text-muted">{t("onPhoneNote")}</p>
      </Section>

      <Section id="privacy-sent" title={t("sentTitle")}>
        <List items={[t("sent1"), t("sent2"), t("sent3"), t("sent4")]} />
      </Section>

      <Section id="privacy-never" title={t("neverTitle")}>
        <List items={[t("never1"), t("never2"), t("never3")]} />
        <p className="text-lg leading-snug">{t("neverNote")}</p>
      </Section>

      <Section id="privacy-hosts" title={t("hostsTitle")}>
        <p className="text-lg leading-snug">{t("hosts")}</p>
      </Section>

      <Section id="privacy-keep" title={t("keepTitle")}>
        <List items={[t("keep1"), t("keep2")]} />
      </Section>

      <Section id="privacy-remove" title={t("removeTitle")}>
        <List items={[t("remove1"), t("remove2"), t("remove3")]} />
        <a href="/about#contact" className={link}>
          {t("contactLink")}
        </a>
      </Section>

      <footer className="mt-2 flex flex-col gap-1 border-t-2 border-border pt-4">
        <p className="text-lg leading-snug text-text-muted">{t("notGov")}</p>
        <p className="text-lg text-text-muted">{t("updated")}</p>
      </footer>
    </Screen>
  );
}
