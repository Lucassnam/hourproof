"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useStickyBarHeight } from "@/components/ui/useStickyBar";
import { EntryValidationError, type EntryStore } from "@/lib/hours/store";
import { ACTIVITY_TYPES, type ActivityType, type Entry, type EntryError } from "@/lib/hours/types";
import { formatDay, formatHoursInput, newId, parseHours } from "./format";

const QUICK_HOURS = [1, 2, 4, 8] as const;
const STEP = 0.25;
const PLACE_MAX = 60;
const NOTE_MAX = 140;

type Field = "date" | "type" | "hours";
const FIELD_ORDER: Field[] = ["date", "hours", "type"];

function fieldFor(code: EntryError): Field {
  if (code === "bad_date") return "date";
  if (code === "in_program_only_for_job_search") return "type";
  return "hours";
}

export function EntryForm({
  store,
  today,
  initial,
  headingRef,
  onSaved,
  onDeleted,
  onCancel,
}: {
  store: EntryStore;
  today: string;
  // Present when editing.
  initial?: Entry;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSaved: (entry: Entry) => void;
  onDeleted: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("log.form");
  const lt = useTranslations("log");
  const locale = useLocale();
  const uid = useId();
  const ids = {
    date: `${uid}-date`,
    dateError: `${uid}-date-error`,
    dateText: `${uid}-date-text`,
    typeLegend: `${uid}-type-legend`,
    typeError: `${uid}-type-error`,
    hours: `${uid}-hours`,
    hoursHint: `${uid}-hours-hint`,
    hoursError: `${uid}-hours-error`,
    inProgram: `${uid}-in-program`,
    inProgramHint: `${uid}-in-program-hint`,
    place: `${uid}-place`,
    note: `${uid}-note`,
    confirm: `${uid}-confirm`,
  };

  const [date, setDate] = useState(initial?.date ?? today);
  const [type, setType] = useState<ActivityType>(initial?.type ?? "work");
  const [hoursText, setHoursText] = useState(initial ? formatHoursInput(locale, initial.hours) : "");
  const [inProgram, setInProgram] = useState(initial?.inProgram ?? false);
  const [place, setPlace] = useState(initial?.place ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<EntryError[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);
  const firstTypeRef = useRef<HTMLInputElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const confirmYesRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useStickyBarHeight(barRef);
  // Bumped on every failed save, so focus moves to the first error even when the same
  // error happens twice in a row.
  const [errorRound, setErrorRound] = useState(0);

  useEffect(() => {
    if (errors.length === 0) return;
    const first = FIELD_ORDER.find((f) => errors.some((code) => fieldFor(code) === f));
    const target = first === "date" ? dateRef : first === "type" ? firstTypeRef : hoursRef;
    focusVisible(target.current);
  }, [errorRound, errors]);

  useEffect(() => {
    if (confirmingDelete) focusVisible(confirmYesRef.current);
  }, [confirmingDelete]);

  // 25 hours trips both bad_hours and the 24-hour day total; the second message ("counting
  // your other entries") only confuses when the entry alone is already wrong.
  const errorsFor = (field: Field) =>
    Array.from(new Set(errors.filter((code) => fieldFor(code) === field))).filter(
      (code) => !(code === "too_many_hours_that_day" && errors.includes("bad_hours")),
    );

  const setHours = (n: number) => {
    setHoursText(formatHoursInput(locale, n));
  };

  const step = (direction: 1 | -1) => {
    const current = parseHours(hoursText);
    const base = Number.isFinite(current) ? Math.round(current / STEP) * STEP : 0;
    const next = Math.min(24, Math.max(STEP, base + direction * STEP));
    setHours(next);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaveFailed(false);

    // The store checks the entry itself; the only rule it can't know is "not after today"
    // (California time), since it has no clock.
    const localErrors: EntryError[] = date === "" || date > today ? ["bad_date"] : [];
    const entry: Entry = {
      id: initial?.id ?? newId(),
      date,
      type,
      hours: parseHours(hoursText),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    if (type === "job_search") entry.inProgram = inProgram;
    const trimmedPlace = place.trim().slice(0, PLACE_MAX);
    const trimmedNote = note.trim().slice(0, NOTE_MAX);
    if (trimmedPlace) entry.place = trimmedPlace;
    if (trimmedNote) entry.note = trimmedNote;

    setSaving(true);
    try {
      if (localErrors.length > 0) throw new EntryValidationError(localErrors);
      await store.put(entry);
      setErrors([]);
      onSaved(entry);
    } catch (err) {
      if (err instanceof EntryValidationError) {
        // A bad date also makes the store's same-day check meaningless, so show the
        // store's codes only when the date itself was fine.
        const codes = localErrors.length > 0 ? localErrors : err.codes;
        setErrors(codes);
        setErrorRound((n) => n + 1);
      } else {
        setSaveFailed(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    try {
      await store.remove(initial.id);
      onDeleted(initial);
    } catch {
      setConfirmingDelete(false);
      setSaveFailed(true);
    }
  };

  const describedBy = (...list: (string | false)[]) => list.filter(Boolean).join(" ") || undefined;
  const dateErrors = errorsFor("date");
  const typeErrors = errorsFor("type");
  const hoursErrors = errorsFor("hours");
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDay(locale, date) : "";

  const inputClass =
    "min-h-12 w-full rounded-2xl border-2 bg-surface px-4 text-lg text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-semibold outline-none">
        {initial ? t("editTitle") : t("addTitle")}
      </h1>

      {/* Date */}
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.date} className="text-lg font-semibold">
          {t("date")}
        </label>
        <input
          ref={dateRef}
          id={ids.date}
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={dateErrors.length > 0 || undefined}
          aria-describedby={describedBy(dateText !== "" && ids.dateText, dateErrors.length > 0 && ids.dateError)}
          className={inputClass + (dateErrors.length > 0 ? " border-danger" : " border-border")}
        />
        {/* The native picker shows the phone's language and date order (e.g. 09/26/2026 on an
            English phone); this line says the chosen day in the page's language. */}
        {dateText !== "" && (
          <p id={ids.dateText} className="text-lg text-text-muted">
            {dateText}
          </p>
        )}
        <FieldErrors id={ids.dateError} messages={dateErrors.map((code) => t(`errors.${code}`))} />
      </div>

      {/* Hours */}
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.hours} className="text-lg font-semibold">
          {t("hours")}
        </label>
        <p id={ids.hoursHint} className="text-lg text-text-muted">
          {t("hoursHint")}
        </p>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t("less")}
            aria-controls={ids.hours}
            className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface-2 text-3xl font-semibold text-text"
          >
            <span aria-hidden="true">−</span>
          </button>
          <input
            ref={hoursRef}
            id={ids.hours}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            aria-invalid={hoursErrors.length > 0 || undefined}
            aria-describedby={describedBy(ids.hoursHint, hoursErrors.length > 0 && ids.hoursError)}
            className={
              inputClass +
              " min-h-14 min-w-0 flex-1 text-center text-2xl font-semibold tabular-nums" +
              (hoursErrors.length > 0 ? " border-danger" : " border-border")
            }
          />
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t("more")}
            aria-controls={ids.hours}
            className="flex min-h-14 min-w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface-2 text-3xl font-semibold text-text"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <FieldErrors id={ids.hoursError} messages={hoursErrors.map((code) => t(`errors.${code}`))} />
        <div role="group" aria-label={t("quickLabel")} className="grid grid-cols-4 gap-2">
          {QUICK_HOURS.map((n) => {
            const selected = parseHours(hoursText) === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setHours(n)}
                aria-label={t("chip", { n })}
                aria-pressed={selected}
                aria-controls={ids.hours}
                className={
                  "min-h-12 rounded-full border-2 text-lg font-semibold tabular-nums " +
                  (selected ? "border-signal bg-signal text-bg" : "border-border bg-surface text-text")
                }
              >
                {formatHoursInput(locale, n)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <fieldset
        className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
        aria-describedby={describedBy(typeErrors.length > 0 && ids.typeError)}
      >
        <legend id={ids.typeLegend} className="mb-2 text-lg font-semibold">
          {t("type")}
        </legend>
        {ACTIVITY_TYPES.map((value, i) => {
          const checked = type === value;
          const inputId = `${uid}-type-${value}`;
          return (
            <label
              key={value}
              htmlFor={inputId}
              className={
                "flex min-h-14 cursor-pointer items-center gap-4 rounded-2xl border-2 px-4 py-3 " +
                (checked ? "border-signal bg-surface-2" : "border-border bg-surface")
              }
            >
              <input
                ref={i === 0 ? firstTypeRef : undefined}
                id={inputId}
                type="radio"
                name={`${uid}-type`}
                value={value}
                checked={checked}
                onChange={() => {
                  setType(value);
                  if (value !== "job_search") setInProgram(false);
                }}
                className="h-7 w-7 shrink-0 accent-signal"
              />
              <span className="flex flex-col">
                <span className="text-lg font-semibold text-text">{lt(`types.${value}.label`)}</span>
                <span className="text-lg leading-snug text-text-muted">{lt(`types.${value}.hint`)}</span>
              </span>
            </label>
          );
        })}
        <FieldErrors id={ids.typeError} messages={typeErrors.map((code) => t(`errors.${code}`))} />
      </fieldset>

      {/* Part of a program (job search only) */}
      {type === "job_search" && (
        <div className="flex flex-col gap-1 rounded-2xl border-2 border-border bg-surface px-4 py-3">
          <label htmlFor={ids.inProgram} className="flex min-h-12 cursor-pointer items-center gap-4">
            <input
              id={ids.inProgram}
              type="checkbox"
              checked={inProgram}
              onChange={(e) => setInProgram(e.target.checked)}
              aria-describedby={ids.inProgramHint}
              className="h-7 w-7 shrink-0 accent-signal"
            />
            <span className="text-lg font-semibold">{t("inProgram")}</span>
          </label>
          <p id={ids.inProgramHint} className="pl-11 text-lg leading-snug text-text-muted">
            {t("inProgramHint")}
          </p>
        </div>
      )}

      {/* Place and note */}
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.place} className="text-lg font-semibold">
          {t("place")}
        </label>
        <input
          id={ids.place}
          type="text"
          value={place}
          maxLength={PLACE_MAX}
          onChange={(e) => setPlace(e.target.value)}
          className={inputClass + " border-border"}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.note} className="text-lg font-semibold">
          {t("note")}
        </label>
        <input
          id={ids.note}
          type="text"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass + " border-border"}
        />
      </div>

      {saveFailed && (
        <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger">
          {t("saveError")}
        </p>
      )}

      {initial &&
        (confirmingDelete ? (
          <div
            role="group"
            aria-labelledby={ids.confirm}
            className="flex flex-col gap-3 rounded-2xl border-2 border-danger bg-surface p-4"
          >
            <p id={ids.confirm} className="text-lg font-semibold text-text">
              {t("deleteConfirm")}
            </p>
            <button
              ref={confirmYesRef}
              type="button"
              onClick={handleDelete}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-danger bg-danger px-6 text-lg font-semibold text-bg"
            >
              {t("deleteYes")}
            </button>
            <Button
              fullWidth
              onClick={() => {
                setConfirmingDelete(false);
                // Put focus back where it was, so keyboard users aren't dropped at the top.
                requestAnimationFrame(() => focusVisible(deleteRef.current));
              }}
            >
              {t("deleteNo")}
            </Button>
          </div>
        ) : (
          <button
            ref={deleteRef}
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-danger bg-transparent px-6 text-lg font-semibold text-danger"
          >
            {t("delete")}
          </button>
        ))}
      {/* Save and Cancel stay in reach at the bottom of the screen, like the checklist's bar.
          It's the last thing in the form, so it never covers the end of the form. */}
      <div
        ref={barRef}
        data-sticky-bar=""
        className="sticky bottom-0 z-10 -mx-4 -mb-10 flex flex-col gap-3 border-t-2 border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden"
      >
        <button
          type="submit"
          disabled={saving}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-signal bg-signal px-6 text-lg font-semibold text-bg"
        >
          {t("save")}
        </button>
        <Button size="lg" fullWidth onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

// Focus without the browser's default "scroll just into view", which can leave the field
// under the sticky Save bar; center it instead.
function focusVisible(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    el.scrollIntoView({ block: "center" });
  } catch {
    // Very old browsers without scrollIntoView options: the focus still happened.
  }
}

function FieldErrors({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div id={id} className="flex flex-col gap-1">
      {messages.map((message) => (
        <p key={message} className="flex items-start gap-2 text-lg font-semibold text-danger">
          <span aria-hidden="true">!</span>
          <span>{message}</span>
        </p>
      ))}
    </div>
  );
}
