"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { ruleText } from "@/lib/rules/engine";
import type { Answer, DisplayOutcome, Lang } from "@/lib/rules/engine";
import type { Rule, County } from "@/lib/rules/schema";
import { Button, buttonClasses } from "@/components/ui/Button";

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:+1${digits}`;
}

export function Result({
  outcome,
  rule,
  answer,
  county,
  lang,
  headingRef,
  onStartOver,
}: {
  outcome: DisplayOutcome;
  rule: Rule | null;
  answer: Answer | undefined;
  county: County;
  lang: Lang;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onStartOver: () => void;
}) {
  const t = useTranslations("common");
  const rt = useTranslations("result");
  const st = useTranslations("screener");

  const ruleTexts = rule ? ruleText(rule, lang) : null;
  const sourceUrl = rule ? rule.sourceUrl : county.sourceUrl;

  return (
    <div className="flex flex-col gap-6">
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
        {rt(`${outcome}.title`)}
      </h1>
      <p className="text-lg">{rt(`${outcome}.body`)}</p>

      {rule && ruleTexts && (
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="text-base text-text-muted">
            {answer === "unsure"
              ? rt("becauseUnsure", { question: ruleTexts.question })
              : rt("becauseYes", { question: ruleTexts.question })}
          </p>
          <p className="mt-3 font-semibold text-text">{st("whatProofHelps")}</p>
          <p className="text-base text-text">
            {ruleTexts.proof}
            {ruleTexts.proofFallback && <span className="ml-2 text-text-muted">{st("englishOnly")}</span>}
          </p>
        </div>
      )}

      <p className="text-base font-semibold text-text-muted">{rt("notDecision")}</p>

      <div className="rounded-2xl bg-surface p-4 flex flex-col gap-3">
        <p className="text-lg font-semibold text-text">{county.name}</p>
        <a href={telHref(county.phone)} className={buttonClasses({ size: "lg", fullWidth: true })}>
          {t("callCounty", { phone: county.phone })}
        </a>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block py-1 text-base text-text-muted underline"
        >
          {t("source")}
        </a>
      </div>

      <Button variant="ghost" onClick={onStartOver}>
        {t("startOver")}
      </Button>
    </div>
  );
}
