"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

// One CF 888 per volunteer organization per month. The person's details live only in this
// component's state and the PDF it makes: nothing is stored or sent. pdf-lib is loaded on
// demand, so it never ships to people who don't open this form.

type Props = { place: string; hours: number; month: string /* YYYY-MM */ };

// The form is English-only, so the month on it is too: "October 2026".
function formMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const field = "min-h-12 w-full min-w-0 rounded-2xl border-2 border-border bg-bg px-3 text-lg font-normal";
const labelClass = "flex flex-col gap-1 text-lg font-semibold";

export function Cf888Form({ place, hours, month }: Props) {
  const t = useTranslations("proof.cf888");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState({
    name: "",
    birthdate: "",
    address1: "",
    address2: "",
    organization: place,
    month: formMonth(month),
    // Plain digits with a "." decimal: the form is English.
    hours: String(Math.round(hours * 100) / 100),
  });
  const set = (key: keyof typeof values) => (e: { currentTarget: HTMLInputElement }) => {
    const value = e.currentTarget.value;
    setValues((v) => ({ ...v, [key]: value }));
  };
  const idBase = `cf888-${(place || "unnamed").replace(/[^a-z0-9]+/gi, "-")}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-12 w-full rounded-2xl border-2 border-signal bg-signal px-4 text-lg font-semibold text-bg"
      >
        {place ? t("fill", { place }) : t("fillUnnamed")}
      </button>
    );
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    try {
      const [{ fillCf888, cf888FileName }, response] = await Promise.all([
        import("@/lib/proof/cf888"),
        fetch("/forms/cf888-template.pdf"),
      ]);
      if (!response.ok) throw new Error("template");
      const bytes = await fillCf888(await response.arrayBuffer(), values);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = cf888FileName(values.organization, month);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-signal bg-surface-2 p-4" aria-labelledby={`${idBase}-h`}>
      <h3 id={`${idBase}-h`} className="font-display text-lg font-semibold">
        {place ? t("heading", { place }) : t("headingUnnamed")}
      </h3>
      <p className="text-lg leading-snug text-text-muted">{t("privacy")}</p>
      <label className={labelClass}>
        {t("name")}
        <input required autoComplete="name" value={values.name} onChange={set("name")} className={field} />
      </label>
      <label className={labelClass}>
        {t("birthdate")}
        <input required type="date" autoComplete="bday" value={values.birthdate} onChange={set("birthdate")} className={field} />
      </label>
      <label className={labelClass}>
        {t("address1")}
        <input required autoComplete="address-line1" value={values.address1} onChange={set("address1")} className={field} />
      </label>
      <label className={labelClass}>
        {t("address2")}
        <input required value={values.address2} onChange={set("address2")} className={field} />
      </label>
      <label className={labelClass}>
        {t("organization")}
        <input required value={values.organization} onChange={set("organization")} className={field} />
      </label>
      <label className={labelClass}>
        {t("month")}
        <input required value={values.month} onChange={set("month")} className={field} />
      </label>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>
          {t("hours")}
          <input required inputMode="decimal" value={values.hours} onChange={set("hours")} aria-describedby={`${idBase}-hours`} className={field} />
        </label>
        <p id={`${idBase}-hours`} className="text-lg text-text-muted">
          {t("hoursHelp")}
        </p>
      </div>
      <button type="submit" disabled={busy} className="min-h-14 w-full rounded-2xl border-2 border-signal bg-signal px-4 text-lg font-semibold text-bg disabled:opacity-60">
        {busy ? t("preparing") : t("download")}
      </button>
      {failed && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {t("error")}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-2xl bg-surface p-3 text-lg leading-snug">
          {t("next")}
        </p>
      )}
      <button type="button" onClick={() => setOpen(false)} className="min-h-12 self-start text-lg font-semibold text-text-muted underline decoration-2 underline-offset-4">
        {t("close")}
      </button>
    </form>
  );
}
