"use client";

import { useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { ruleText } from "@/lib/rules/engine";
import type { Answers, Lang } from "@/lib/rules/engine";
import type { Rule } from "@/lib/rules/schema";
import { Button } from "@/components/ui/Button";
import { safeGet, safeRemove, safeSet } from "@/lib/storage/safe";

export type ChecklistMode = "continue" | "none" | "unsure";

// Boxes checked but not yet submitted, so switching language (which reloads the screen) or a
// reload doesn't wipe them: {"rulesVersion": "...", "checked": ["pregnant", ...]}.
export const CHECKLIST_DRAFT_KEY = "hp.screener.v2.draft";

function loadDraft(rulesVersion: string, validIds: ReadonlySet<string>): string[] | null {
  const raw = safeGet("session", CHECKLIST_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { rulesVersion?: unknown; checked?: unknown };
    if (parsed?.rulesVersion === rulesVersion && Array.isArray(parsed.checked)) {
      return parsed.checked.filter((id): id is string => typeof id === "string" && validIds.has(id));
    }
  } catch {
    // Malformed; ignore it.
  }
  safeRemove("session", CHECKLIST_DRAFT_KEY);
  return null;
}

// The "Check any that apply" screen: every exemption on one screen as a checkbox row.
// Checked state is local until a button is pressed; the parent turns the submission into
// answers with the engine's checklistAnswers(). On mount, the boxes come from the unsent
// draft if there is one, otherwise from `answers`, so coming Back from a checklist result
// re-checks the boxes the user had checked (the engine's goBack keeps each exemption's yes/no
// when it reopens the checklist). The parent remounts this component (via `key`) every time
// the checklist screen is entered.
export function Checklist({
  rules,
  notes,
  answers,
  rulesVersion,
  index,
  total,
  lang,
  headingRef,
  onSubmit,
}: {
  rules: readonly Rule[];
  notes: readonly Rule[];
  answers: Answers;
  rulesVersion: string;
  index: number;
  total: number;
  lang: Lang;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSubmit: (checkedIds: string[], mode: ChecklistMode) => void;
}) {
  const st = useTranslations("screener");
  const ct = useTranslations("screener.checklist");
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => {
    const draft = loadDraft(rulesVersion, new Set(rules.map((r) => r.id)));
    return new Set(draft ?? rules.filter((r) => answers[r.id] === "yes").map((r) => r.id));
  });

  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    setChecked(next);
    safeSet("session", CHECKLIST_DRAFT_KEY, JSON.stringify({ rulesVersion, checked: [...next] }));
  };

  const submit = (ids: string[], mode: ChecklistMode) => {
    safeRemove("session", CHECKLIST_DRAFT_KEY);
    onSubmit(ids, mode);
  };

  // Keep the rule order, not the click order, so the result lists match the screen.
  const checkedIds = () => rules.filter((r) => checked.has(r.id)).map((r) => r.id);

  return (
    <>
      <p className="text-lg text-text-muted">{st("questionOf", { n: index + 1, total })}</p>
      <div className="flex flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
          {ct("title")}
        </h1>
        <p id="checklist-sub" className="text-lg text-text-muted">
          {ct("sub")}
        </p>
      </div>

      <ul className="flex flex-col gap-2" aria-describedby="checklist-sub">
        {rules.map((rule) => {
          const text = ruleText(rule, lang);
          const inputId = `ex-${rule.id}`;
          const isChecked = checked.has(rule.id);
          return (
            <li
              key={rule.id}
              className={
                "relative rounded-2xl border-2 " +
                (isChecked ? "border-signal bg-surface-2" : "border-border bg-surface")
              }
            >
              <label htmlFor={inputId} className="flex min-h-14 cursor-pointer items-center gap-4 py-2 pl-4 pr-20">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => toggle(rule.id, e.target.checked)}
                  className="h-7 w-7 shrink-0 accent-signal"
                />
                <span className="text-lg text-text">
                  {text.label}
                  {text.labelFallback && <span className="ml-2 text-text-muted">{st("englishOnly")}</span>}
                </span>
              </label>
              <details className="group px-4 [&[open]]:pb-4">
                <summary
                  aria-label={`${ct("more")}: ${text.label ?? ""}`}
                  className="absolute right-1 top-1 flex min-h-12 min-w-14 cursor-pointer list-none items-center justify-center gap-1 rounded-xl px-1 text-lg text-text-muted underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden"
                >
                  {ct("moreShort")}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
                  <p className="text-lg text-text">
                    {text.question}
                    {text.questionFallback && <span className="ml-2 text-text-muted">{st("englishOnly")}</span>}
                  </p>
                  {text.hint && (
                    <p className="text-lg text-text-muted">
                      {text.hint}
                      {text.hintFallback && <span className="ml-2">{st("englishOnly")}</span>}
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {notes.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
          {notes.map((note) => {
            const text = ruleText(note, lang);
            return (
              <div key={note.id} className="flex flex-col gap-1">
                <p className="text-lg font-semibold text-text">
                  {text.question}
                  {text.questionFallback && <span className="ml-2 font-normal text-text-muted">{st("englishOnly")}</span>}
                </p>
                {text.hint && (
                  <p className="text-lg text-text-muted">
                    {text.hint}
                    {text.hintFallback && <span className="ml-2">{st("englishOnly")}</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="strong"
          size="lg"
          fullWidth
          disabled={checked.size === 0}
          onClick={() => submit(checkedIds(), "continue")}
        >
          {ct("continue")}
        </Button>
        <Button size="lg" fullWidth onClick={() => submit([], "none")}>
          {ct("none")}
        </Button>
        <Button size="lg" fullWidth onClick={() => submit(checkedIds(), "unsure")}>
          {ct("unsure")}
        </Button>
      </div>
    </>
  );
}
