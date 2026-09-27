"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { nextStep, goBack, displayOutcome, ruleText, checklistAnswers, CHECKLIST } from "@/lib/rules/engine";
import type { Answer, Answers, Lang } from "@/lib/rules/engine";
import type { RuleSet } from "@/lib/rules/schema";
import { Screen } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { ChoiceButtons } from "@/components/ui/ChoiceButtons";
import { safeGet, safeRemove, safeSet } from "@/lib/storage/safe";
import { Result } from "./Result";

const STORAGE_KEY = "hp.screener";

function loadStoredAnswers(): Answers {
  const raw = safeGet("session", STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Answers;
  } catch {
    // Stored value may be malformed; start fresh.
  }
  return {};
}

function saveStoredAnswers(answers: Answers) {
  safeSet("session", STORAGE_KEY, JSON.stringify(answers));
}

function clearStoredAnswers() {
  safeRemove("session", STORAGE_KEY);
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

  // Restore any in-progress answers once, on mount (may jump from question 1 to the saved one).
  useEffect(() => {
    setAnswers(loadStoredAnswers());
    setRestored(true);
  }, []);

  // Persist on every change, but only after the initial restore has happened,
  // so we don't immediately overwrite storage with an empty object.
  useEffect(() => {
    if (!restored) return;
    saveStoredAnswers(answers);
  }, [answers, restored]);

  const step = nextStep(ruleSet, answers);
  // TEMPORARY (Task 3 of Phase 2, removed in Task 4): v2's engine groups all exemption rules
  // into a single `checklist` Step, meant for a real "check any that apply" screen. That real
  // UI is Task 4's job. Until then, this component walks the checklist's rules one at a time
  // as individual yes/no/unsure questions (like Phase 1 did for every rule), so the app still
  // type-checks, builds and answers correctly; it just doesn't show the short checklist UX yet.
  const checklistCurrent = step.type === "checklist" ? step.rules.find((r) => answers[r.id] === undefined) : null;
  const stepKey =
    step.type === "question"
      ? step.rule.id
      : step.type === "checklist"
        ? (checklistCurrent?.id ?? "checklist-done")
        : `result-${step.ruleIds[0] ?? step.unsureAt ?? "subject"}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [stepKey]);

  const handleAnswer = (id: string, answer: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };

  // TEMPORARY (Task 3, removed in Task 4). Mirrors the old one-question-at-a-time flow: "yes"
  // on any exemption finalizes the checklist immediately (checked = just this rule); "unsure"
  // finalizes with whatever was already checked (none, in this sequential walkthrough); "no"
  // moves to the next unanswered exemption, and once every exemption has a "no", finalizes as
  // "none of these".
  const handleChecklistAnswer = (rule: { id: string }, answer: Answer) => {
    if (step.type !== "checklist") return;
    if (answer === "yes") {
      setAnswers((prev) => ({ ...prev, [rule.id]: answer, ...checklistAnswers(ruleSet, [rule.id], "continue") }));
      return;
    }
    if (answer === "unsure") {
      setAnswers((prev) => ({ ...prev, [rule.id]: answer, ...checklistAnswers(ruleSet, [], "unsure") }));
      return;
    }
    setAnswers((prev) => {
      const merged = { ...prev, [rule.id]: answer };
      const remaining = step.type === "checklist" && step.rules.some((r) => merged[r.id] === undefined);
      return remaining ? merged : { ...merged, ...checklistAnswers(ruleSet, [], "none") };
    });
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
    // v2 results can carry several checked exemption ids (e.g. multiple boxes checked on the
    // real checklist UI); this temporary adapter only ever finalizes with one (see
    // handleChecklistAnswer), so showing details for the first id covers every reachable case
    // until Task 4 builds the real multi-item result display. An "unsure" result instead
    // carries the id (or CHECKLIST) of whatever the user wasn't sure about.
    const singleRuleId = step.unsureAt !== null && step.unsureAt !== CHECKLIST ? step.unsureAt : step.ruleIds[0];
    const rule = singleRuleId ? ruleSet.rules.find((r) => r.id === singleRuleId) ?? null : null;
    // The rule can be attached to this result via a "yes" answer (e.g. an exemption) or via an
    // "unsure" answer (ask_county is reachable from unsure on any question or the checklist).
    // Result needs to know which, so it never claims the user said yes when they said unsure.
    const answer = step.unsureAt !== null ? "unsure" : rule ? answers[rule.id] : undefined;

    return (
      <Screen>
        {backButton}
        <Result
          outcome={outcome}
          rule={rule}
          answer={answer}
          county={ruleSet.county}
          generalSourceUrl={ruleSet.generalSourceUrl}
          lang={locale}
          headingRef={headingRef}
          onStartOver={handleStartOver}
        />
      </Screen>
    );
  }

  if (step.type === "checklist") {
    // TEMPORARY (Task 3, removed in Task 4): see handleChecklistAnswer above. `checklistCurrent`
    // is only null for an instant between the last exemption's answer and the merged
    // finalizing answers landing in state, so there's nothing meaningful to render then.
    if (!checklistCurrent) return null;
    const text = ruleText(checklistCurrent, locale);
    return (
      <Screen>
        {backButton}
        <p className="text-lg text-text-muted">{st("questionOf", { n: step.index + 1, total: step.total })}</p>
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
        <ChoiceButtons onSelect={(answer) => handleChecklistAnswer(checklistCurrent, answer)} />
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
