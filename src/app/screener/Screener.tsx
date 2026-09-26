"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ruleSet } from "@/lib/rules/load";
import { nextStep, goBack, displayOutcome, ruleText } from "@/lib/rules/engine";
import type { Answer, Answers, Lang } from "@/lib/rules/engine";
import { Screen } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { ChoiceButtons } from "@/components/ui/ChoiceButtons";
import { Result } from "./Result";

const STORAGE_KEY = "hp.screener";

function loadStoredAnswers(): Answers {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Answers;
  } catch {
    // sessionStorage may be unavailable or throw (private mode); start fresh.
  }
  return {};
}

function saveStoredAnswers(answers: Answers) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Storage may throw; the screener still works for this page view without persistence.
  }
}

function clearStoredAnswers() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}

export function Screener() {
  const t = useTranslations("common");
  const st = useTranslations("screener");
  const locale = useLocale() as Lang;
  const [answers, setAnswers] = useState<Answers>({});
  const [hydrated, setHydrated] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore any in-progress answers once, on mount, before the first paint that matters.
  useEffect(() => {
    setAnswers(loadStoredAnswers());
    setHydrated(true);
  }, []);

  // Persist on every change, but only after the initial restore has happened,
  // so we don't immediately overwrite storage with an empty object.
  useEffect(() => {
    if (!hydrated) return;
    saveStoredAnswers(answers);
  }, [answers, hydrated]);

  const step = nextStep(ruleSet, answers);
  const stepKey = step.type === "question" ? step.rule.id : `result-${step.ruleId ?? "subject"}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [stepKey]);

  if (!hydrated) return null;

  const handleAnswer = (id: string, answer: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };

  const handleBack = () => {
    setAnswers((prev) => goBack(ruleSet, prev));
  };

  const handleStartOver = () => {
    clearStoredAnswers();
    setAnswers({});
  };

  const backButton = (
    <Button variant="ghost" onClick={handleBack} aria-label={t("back")}>
      {t("back")}
    </Button>
  );

  if (step.type === "result") {
    const outcome = displayOutcome(ruleSet, step);
    const rule = step.ruleId ? ruleSet.rules.find((r) => r.id === step.ruleId) ?? null : null;
    // The rule can be attached to this result via a "yes" answer (e.g. an exemption) or
    // an "unsure" answer (ask_county is reachable from unsure on ANY question). Result
    // needs to know which, so it never claims the user said yes when they said unsure.
    const answer = step.ruleId ? answers[step.ruleId] : undefined;

    return (
      <Screen>
        {backButton}
        <Result
          outcome={outcome}
          rule={rule}
          answer={answer}
          county={ruleSet.county}
          lang={locale}
          headingRef={headingRef}
          onStartOver={handleStartOver}
        />
      </Screen>
    );
  }

  const { rule, index, total } = step;
  const text = ruleText(rule, locale);

  return (
    <Screen>
      {backButton}
      <p className="text-base text-text-muted">{st("questionOf", { n: index + 1, total })}</p>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
        {text.question}
        {text.questionFallback && (
          <span className="ml-2 align-middle text-base font-normal text-text-muted">{st("englishOnly")}</span>
        )}
      </h1>
      <ChoiceButtons onSelect={(answer) => handleAnswer(rule.id, answer)} />
    </Screen>
  );
}
