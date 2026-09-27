"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { nextStep, goBack, ruleText, checklistAnswers } from "@/lib/rules/engine";
import type { Answer, Answers, Lang } from "@/lib/rules/engine";
import type { RuleSet } from "@/lib/rules/schema";
import { Screen } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { ChoiceButtons } from "@/components/ui/ChoiceButtons";
import { safeGet, safeRemove, safeSet } from "@/lib/storage/safe";
import { Checklist, CHECKLIST_DRAFT_KEY, type ChecklistMode } from "./Checklist";
import { Result } from "./Result";

// Session-scoped (one tab, cleared when it closes): {"rulesVersion": "...", "answers": {...}}.
// Answers saved under a different rules version are dropped, since the questions may differ.
const STORAGE_KEY = "hp.screener.v2";
// Phase 1's key (bare answers, no version). Removed on sight; never read.
const LEGACY_STORAGE_KEY = "hp.screener";

const ANSWER_VALUES: ReadonlySet<string> = new Set(["yes", "no", "unsure"]);

function loadStoredAnswers(rulesVersion: string): Answers {
  const raw = safeGet("session", STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { rulesVersion: storedVersion, answers } = parsed as { rulesVersion?: unknown; answers?: unknown };
      if (storedVersion === rulesVersion && answers && typeof answers === "object") {
        const out: Record<string, Answer> = {};
        for (const [k, v] of Object.entries(answers)) if (typeof v === "string" && ANSWER_VALUES.has(v)) out[k] = v as Answer;
        return out;
      }
    }
  } catch {
    // Stored value may be malformed; start fresh.
  }
  safeRemove("session", STORAGE_KEY);
  return {};
}

function saveStoredAnswers(rulesVersion: string, answers: Answers) {
  safeSet("session", STORAGE_KEY, JSON.stringify({ rulesVersion, answers }));
}

export function Screener({ ruleSet }: { ruleSet: RuleSet }) {
  const t = useTranslations("common");
  const st = useTranslations("screener");
  const locale = useLocale() as Lang;
  const router = useRouter();
  // Server render and first client render both start at question 1 (answers = {}), so the
  // page is never blank and hydration matches. Saved answers are restored right after mount.
  const [answers, setAnswers] = useState<Answers>({});
  const [restored, setRestored] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore any in-progress answers once, on mount (may jump from question 1 to the saved screen).
  useEffect(() => {
    safeRemove("session", LEGACY_STORAGE_KEY);
    setAnswers(loadStoredAnswers(ruleSet.version));
    setRestored(true);
  }, [ruleSet.version]);

  // Persist on every change, but only after the initial restore has happened,
  // so we don't immediately overwrite storage with an empty object.
  useEffect(() => {
    if (!restored) return;
    saveStoredAnswers(ruleSet.version, answers);
  }, [answers, restored, ruleSet.version]);

  const step = nextStep(ruleSet, answers);
  const stepKey =
    step.type === "question"
      ? step.rule.id
      : step.type === "checklist"
        ? "checklist"
        : `result-${step.outcome}-${step.ruleIds.join(",")}-${step.unsureAt ?? ""}`;

  // Focus moves to the new screen's heading, so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepKey]);

  const handleAnswer = (id: string, answer: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };

  const handleChecklist = (checkedIds: string[], mode: ChecklistMode) => {
    setAnswers((prev) => ({ ...prev, ...checklistAnswers(ruleSet, checkedIds, mode) }));
  };

  const handleBack = () => {
    // Back on question 1 leaves the screener (answers stay saved for this tab).
    if (step.type === "question" && step.index === 0) {
      router.push("/");
      return;
    }
    setAnswers((prev) => goBack(ruleSet, prev));
  };

  const handleStartOver = () => {
    safeRemove("session", STORAGE_KEY);
    safeRemove("session", CHECKLIST_DRAFT_KEY);
    setAnswers({});
  };

  const backButton = (
    <div className="print:hidden">
      <Button variant="ghost" onClick={handleBack}>
        {t("back")}
      </Button>
    </div>
  );

  if (step.type === "result") {
    return (
      <Screen>
        {backButton}
        <Result step={step} ruleSet={ruleSet} lang={locale} headingRef={headingRef} onStartOver={handleStartOver} />
      </Screen>
    );
  }

  if (step.type === "checklist") {
    return (
      <Screen>
        {backButton}
        <Checklist
          key={stepKey}
          rules={step.rules}
          notes={step.notes}
          answers={answers}
          rulesVersion={ruleSet.version}
          index={step.index}
          total={step.total}
          lang={locale}
          headingRef={headingRef}
          onSubmit={handleChecklist}
        />
      </Screen>
    );
  }

  const { rule, index, total } = step;
  const text = ruleText(rule, locale);

  return (
    <Screen>
      {backButton}
      <p className="text-lg text-text-muted">{st("questionOf", { n: index + 1, total })}</p>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
        {text.question}
        {text.questionFallback && (
          <span className="ml-2 align-middle text-lg font-normal text-text-muted">{st("englishOnly")}</span>
        )}
      </h1>
      {text.hint && (
        <p className="text-lg text-text-muted">
          {text.hint}
          {text.hintFallback && <span className="ml-2">{st("englishOnly")}</span>}
        </p>
      )}
      <ChoiceButtons onSelect={(answer) => handleAnswer(rule.id, answer)} />
    </Screen>
  );
}
