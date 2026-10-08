"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CHECKLIST, countyScript, displayOutcome, ruleText } from "@/lib/rules/engine";
import type { Lang, Step } from "@/lib/rules/engine";
import type { Rule, RuleSet } from "@/lib/rules/schema";
import { Button, buttonClasses } from "@/components/ui/Button";
import { californiaDate } from "@/lib/dates";
import { telHref } from "@/lib/tel";

type ResultStep = Extract<Step, { type: "result" }>;

// "2026-09-26" -> "September 26, 2026" / "26 de septiembre de 2026". The date is already the
// California calendar date, so it is formatted in UTC to keep it from shifting a day.
function formatDate(isoDate: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return isoDate;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
      <h2 className="font-sans text-lg font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

// The copy button only shows when the Clipboard API exists (checked after mount, so the
// server render and first client render agree). A failed copy just leaves the button as it
// was: nothing alarming, the script is still on screen to read out.
function CopyButton({ text }: { text: string }) {
  const rt = useTranslations("result");
  const [available, setAvailable] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setAvailable(typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function");
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    setCopied(false);
  }, [text]);

  if (!available) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button onClick={copy}>{rt("copy")}</Button>
      <span role="status" className="text-lg font-semibold text-proof">
        {copied ? rt("copied") : ""}
      </span>
    </div>
  );
}

export function Result({
  step,
  ruleSet,
  lang,
  headingRef,
  onStartOver,
}: {
  step: ResultStep;
  ruleSet: RuleSet;
  lang: Lang;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onStartOver: () => void;
}) {
  const t = useTranslations("common");
  const rt = useTranslations("result");
  const st = useTranslations("screener");

  // ALWAYS route the display through displayOutcome(): it is the safety gate that turns
  // "likely exempt" into "you may be exempt" until the rules have been reviewed.
  const outcome = displayOutcome(ruleSet, step);
  const script = countyScript(ruleSet, step, lang);
  const county = ruleSet.county;
  const findRule = (id: string) => ruleSet.rules.find((r) => r.id === id) ?? null;

  const isExempt = outcome === "likely_exempt" || outcome === "possibly_exempt";
  // Exemption boxes that were checked (only on an exempt result).
  const checkedRules: Rule[] = isExempt ? step.ruleIds.map(findRule).filter((r): r is Rule => !!r) : [];
  // A single question answered "yes" that decided the result (not_subject, meeting_requirement).
  const yesRule = !isExempt && step.unsureAt === null && step.ruleIds.length === 1 ? findRule(step.ruleIds[0]) : null;
  // The question (or the checklist) the user wasn't sure about.
  const unsureRule = step.unsureAt !== null && step.unsureAt !== CHECKLIST ? findRule(step.unsureAt) : null;
  const unsureChecklist = step.unsureAt === CHECKLIST;

  // The rule's own source when rules decided this result; otherwise the general CDSS letter.
  // (county.sourceUrl only backs the phone number, so it is never shown as "Source" here.)
  const decidingRules = checkedRules.length ? checkedRules : yesRule ? [yesRule] : unsureRule ? [unsureRule] : [];
  const sourceUrls = decidingRules.length
    ? [...new Set(decidingRules.map((r) => r.sourceUrl))]
    : [ruleSet.generalSourceUrl];

  const today = formatDate(californiaDate(), lang);

  let why: ReactNode = null;
  if (checkedRules.length) {
    why = (
      <>
        <p className="text-lg text-text-muted">{rt("youChecked")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-6 text-lg text-text">
          {checkedRules.map((r) => {
            const text = ruleText(r, lang);
            return (
              <li key={r.id}>
                {text.label}
                {text.labelFallback && <span className="ml-2 text-text-muted">{st("englishOnly")}</span>}
              </li>
            );
          })}
        </ul>
      </>
    );
  } else if (yesRule) {
    const text = ruleText(yesRule, lang);
    // The deciding rule's own note (e.g. "The county already has your birth date." or, for
    // meeting the requirement, what records to keep). Only ever shown for a "yes"; never
    // for "not sure", which is what used to tell unsure people "you are meeting it".
    why = (
      <>
        <p className="text-lg text-text">{rt("becauseYes", { question: text.question })}</p>
        {text.proof && (
          <p className="text-lg text-text-muted">
            {text.proof}
            {text.proofFallback && <span className="ml-2">{st("englishOnly")}</span>}
          </p>
        )}
      </>
    );
  } else if (unsureRule || unsureChecklist) {
    const question = unsureRule ? ruleText(unsureRule, lang).question : rt("checklistUnsure");
    why = <p className="text-lg text-text">{rt("becauseUnsure", { question })}</p>;
  }

  const trackPrimary = outcome === "subject" || outcome === "meeting_requirement";
  const trackSecondary = outcome === "ask_county";

  return (
    <div className="flex flex-col gap-6">
      <p className="hidden text-lg text-text-muted print:block">{rt("date", { date: today })}</p>

      <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
        {rt(`${outcome}.title`)}
      </h1>
      <p className="text-lg">{rt(`${outcome}.body`)}</p>

      <p className="text-lg font-semibold text-text-muted">{rt("notDecision")}</p>

      {why && <Section title={rt("why")}>{why}</Section>}

      {/* Only exempt results say what to bring. ask_county, meeting_requirement and subject never do. */}
      {isExempt && checkedRules.some((r) => ruleText(r, lang).proof) && (
        <Section title={rt("whatToBring")}>
          <ul className="flex flex-col gap-3">
            {checkedRules.map((r) => {
              const text = ruleText(r, lang);
              if (!text.proof) return null;
              return (
                <li key={r.id} className="flex flex-col gap-1">
                  <p className="text-lg font-semibold text-text">
                    {text.label}
                    {text.labelFallback && <span className="ml-2 font-normal text-text-muted">{st("englishOnly")}</span>}
                  </p>
                  <p className="text-lg text-text">
                    {text.proof}
                    {text.proofFallback && <span className="ml-2 text-text-muted">{st("englishOnly")}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {script && (
        <Section title={rt("whatToSay")}>
          <p className="text-lg text-text-muted">{rt("sayIntro")}</p>
          <blockquote
            data-testid="county-script"
            className="rounded-xl border-l-4 border-signal bg-surface p-4 text-lg text-text"
          >
            “{script}”
          </blockquote>
          <div className="print:hidden">
            <CopyButton text={script} />
          </div>
        </Section>
      )}

      <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
        <p className="text-lg font-semibold text-text">{county.name}</p>
        <p className="hidden text-lg font-semibold text-text print:block">{county.phone}</p>
        <a
          href={telHref(county.phone)}
          className={buttonClasses({ size: "lg", fullWidth: true, className: "print:hidden" })}
        >
          <span>
            {t.rich("callCounty", {
              phone: county.phone,
              num: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
            })}
          </span>
        </a>
        {sourceUrls.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center self-start text-lg text-text-muted underline print:hidden"
          >
            {sourceUrls.length > 1 ? t("sourceN", { n: i + 1 }) : t("source")}
          </a>
        ))}
      </div>

      {(trackPrimary || trackSecondary) && (
        <div className="flex flex-col gap-2 print:hidden">
          <a
            href="/log"
            className={buttonClasses({
              variant: trackPrimary ? "strong" : "primary",
              size: "lg",
              fullWidth: true,
            })}
          >
            {trackPrimary ? rt("startTracking") : rt("trackWhileChecking")}
          </a>
          {trackPrimary && (
            <Link
              href="/shiftcred"
              className="flex min-h-12 items-center justify-center text-center text-lg font-semibold text-signal underline decoration-2 underline-offset-4"
            >
              {lang === "es" ? "Buscar un turno voluntario" : "Find a volunteer shift"}
            </Link>
          )}
        </div>
      )}

      <Button fullWidth onClick={() => window.print()} className="print:hidden">
        {rt("print")}
      </Button>

      <Button variant="ghost" onClick={onStartOver} className="print:hidden">
        {t("startOver")}
      </Button>
    </div>
  );
}
