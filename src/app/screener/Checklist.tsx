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

  const n = checked.size;

  return (
    <>
      <p className="text-lg text-text-muted">{st("questionOf", { n: index + 1, total })}</p>
      <div className="flex flex-col gap-2">
        <h1 id="checklist-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
          {ct("title")}
        </h1>
        <p id="checklist-sub" className="text-lg text-text-muted">
          {ct("sub")}
        </p>
      </div>

      {/* A fieldset groups the checkboxes under the heading (as its name) and the sub-line. */}
      <fieldset aria-labelledby="checklist-title" aria-describedby="checklist-sub" className="m-0 min-w-0 border-0 p-0">
        <ul className="flex flex-col gap-2 pb-2">
          {rules.map((rule) => {
            const text = ruleText(rule, lang);
            const inputId = `ex-${rule.id}`;
            const isChecked = checked.has(rule.id);
            return (
              <li
                key={rule.id}
                className={"rounded-2xl border-2 " + (isChecked ? "border-signal bg-surface-2" : "border-border bg-surface")}
              >
                {/* The checkbox and its label use the full row width; the disclosure sits below. */}
                <label htmlFor={inputId} className="flex min-h-14 cursor-pointer items-center gap-4 px-4 pt-2">
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
                <details className="group pl-15 pr-4 [&[open]]:pb-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 self-start text-lg text-text-muted [&::-webkit-details-marker]:hidden">
                    <span className="underline decoration-1 underline-offset-4">{ct("more")}</span>
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
                  <div className="flex flex-col gap-2 pt-1">
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
      </fieldset>

      {notes.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
          {notes.map((note) => {
            const text = ruleText(note, lang);
            // The checklist's own wording when the rule has one (e.g. "check … above" instead of
            // the question-screen hint's "go back and answer yes…"); otherwise the hint.
            const body = text.checklistNote ?? text.hint;
            const bodyFallback = text.checklistNote ? text.checklistNoteFallback : text.hintFallback;
            return (
              <div key={note.id} className="flex flex-col gap-1">
                <p className="text-lg font-semibold text-text">
                  {text.question}
                  {text.questionFallback && <span className="ml-2 font-normal text-text-muted">{st("englishOnly")}</span>}
                </p>
                {body && (
                  <p className="text-lg text-text-muted">
                    {body}
                    {bodyFallback && <span className="ml-2">{st("englishOnly")}</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky action bar: always in reach while scrolling the list. It sits in normal flow
          after the list, so at the end of the page it never covers the last row. The negative
          margins pull it over <main>'s side and bottom padding so it spans the screen. */}
      <div
        data-testid="checklist-actions"
        className="sticky bottom-0 z-10 -mx-4 -mb-10 flex flex-col gap-3 border-t-2 border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden"
      >
        {n > 0 ? (
          <Button variant="strong" size="lg" fullWidth onClick={() => submit(checkedIds(), "continue")}>
            {ct("continue", { n })}
          </Button>
        ) : (
          <>
            <Button size="lg" fullWidth onClick={() => submit([], "none")}>
              {ct("none")}
            </Button>
            <Button size="lg" fullWidth onClick={() => submit([], "unsure")}>
              {ct("unsure")}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
