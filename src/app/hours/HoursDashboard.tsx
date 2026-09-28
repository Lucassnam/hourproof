"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToolNav } from "@/components/ui/ToolNav";
import { saveProofFile } from "@/lib/activities/files";
import { loadActivities, saveActivities } from "@/lib/activities/store";
import {
  currentMonth,
  MONTHLY_HOURS_TARGET,
  monthEntries,
  totals,
  WEEKLY_EARNINGS_TARGET,
  WEEKLY_HOURS_TARGET,
  weeksInMonth,
} from "@/lib/activities/summary";
import type { ActivityEntry, ActivityType } from "@/lib/activities/types";

const LABELS: Record<ActivityType, { en: string; es: string; icon: string }> = {
  work: { en: "Paid work", es: "Trabajo pagado", icon: "$" },
  volunteer: { en: "Volunteering", es: "Voluntariado", icon: "♥" },
  school: { en: "School", es: "Escuela", icon: "A" },
  training: { en: "Job training", es: "Capacitación", icon: "✓" },
};

const COPY = {
  en: {
    eyebrow: "My 80-hour plan",
    title: "Your hours",
    intro: "Add work, school, training, and volunteering to the same monthly total.",
    goalReached: "You reached 80 hours",
    left: "hours to go",
    goal: "of 80 hours",
    add: "Add hours",
    cancel: "Cancel",
    formTitle: "What did you do?",
    activity: "Choose one",
    organization: "Where did you do it?",
    organizationPlaceholder: "Employer, school, or program",
    date: "Date",
    hoursLabel: "Hours",
    earnings: "Gross pay before taxes (optional)",
    earningsHelp: `$${WEEKLY_EARNINGS_TARGET.toFixed(2)} of gross pay in one week may meet that week’s requirement, even with fewer than 20 hours.`,
    addProof: "Add a document now (optional)",
    proof: "Choose a photo or PDF",
    save: "Add to total",
    emptyTitle: "No hours added yet",
    empty: "Start with one thing you did this month.",
    recent: "Hours you added",
    recentHelp: "These are the hours saved for the month selected above.",
    verified: "Document added",
    noProof: "Document needed",
    delete: "Remove",
    weekly: "Weekly plan",
    weeklyHelp: "Aim for 20 hours in each part of the month.",
    weeklyToggle: "View the 4 weeks",
    earningsTitle: "Earnings can also count",
    earningsInfoLabel: "How earnings can count",
    closeInfo: "Close",
    onTrack: "Done",
    needs: "hours left",
    upcoming: "No hours yet",
    countyNote: "Your county makes the final decision about which hours and documents count.",
  },
  es: {
    eyebrow: "Mi plan de 80 horas",
    title: "Sus horas",
    intro: "Sume trabajo, escuela, capacitación y voluntariado en el mismo total mensual.",
    goalReached: "Llegó a 80 horas",
    left: "horas por completar",
    goal: "de 80 horas",
    add: "Agregar horas",
    cancel: "Cancelar",
    formTitle: "¿Qué hizo?",
    activity: "Elija una opción",
    organization: "¿Dónde lo hizo?",
    organizationPlaceholder: "Empleador, escuela o programa",
    date: "Fecha",
    hoursLabel: "Horas",
    earnings: "Pago bruto antes de impuestos (opcional)",
    earningsHelp: `$${WEEKLY_EARNINGS_TARGET.toFixed(2)} de pago bruto en una semana puede cumplir el requisito de esa semana, aunque sean menos de 20 horas.`,
    addProof: "Agregar un documento ahora (opcional)",
    proof: "Elija una foto o PDF",
    save: "Sumar al total",
    emptyTitle: "Aún no agregó horas",
    empty: "Comience con una actividad que hizo este mes.",
    recent: "Horas que agregó",
    recentHelp: "Estas son las horas guardadas para el mes seleccionado arriba.",
    verified: "Documento agregado",
    noProof: "Falta documento",
    delete: "Quitar",
    weekly: "Plan semanal",
    weeklyHelp: "Trate de llegar a 20 horas en cada parte del mes.",
    weeklyToggle: "Ver las 4 semanas",
    earningsTitle: "Los ingresos también pueden contar",
    earningsInfoLabel: "Cómo pueden contar los ingresos",
    closeInfo: "Cerrar",
    onTrack: "Listo",
    needs: "horas pendientes",
    upcoming: "Sin horas",
    countyNote: "Su condado toma la decisión final sobre las horas y los documentos que cuentan.",
  },
} as const;

export function HoursDashboard() {
  const locale = useLocale() === "es" ? "es" : "en";
  const c = COPY[locale];
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ActivityType>("work");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(`${month}-01`);
  const [hours, setHours] = useState("");
  const [earnings, setEarnings] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showEarningsInfo, setShowEarningsInfo] = useState(false);

  useEffect(() => {
    setEntries(loadActivities());
  }, []);

  const currentEntries = useMemo(
    () => monthEntries(entries, month).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, month],
  );
  const summary = totals(currentEntries);
  const weeks = weeksInMonth(month, currentEntries);
  const hoursLeft = Math.max(0, MONTHLY_HOURS_TARGET - summary.hours);
  const monthName = new Date(`${month}-02T12:00:00`).toLocaleDateString(
    locale === "es" ? "es-US" : "en-US",
    { month: "long", year: "numeric" },
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    let stored: { id: string; name: string } | undefined;
    if (file) stored = await saveProofFile(file, type, date.slice(0, 7));
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      date,
      type,
      title: title.trim(),
      hours: Number(hours),
      grossEarnings: type === "work" ? Number(earnings || 0) : 0,
      proofFileName: stored?.name,
      proofFileId: stored?.id,
      source: "manual",
      verified: Boolean(stored),
    };
    setEntries((current) => {
      const next = [...current, entry];
      saveActivities(next);
      return next;
    });
    setTitle("");
    setHours("");
    setEarnings("");
    setFile(null);
    setAdding(false);
  }

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="whitespace-nowrap font-display text-base font-bold">HourProof</Link>
        <div className="flex items-center gap-1"><LanguageSwitch /><ThemeToggle /></div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12">
        <ToolNav current="hours" />

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-[.12em] text-proof">{c.eyebrow}</p>
            <label className="sr-only" htmlFor="hours-month">Month</label>
            <input id="hours-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setDate(`${event.target.value}-01`); }} className="min-h-12 rounded-xl border border-border bg-surface px-2 text-sm font-semibold" />
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold">{c.title}</h1>
          <p className="mt-1 leading-relaxed text-text-muted">{c.intro}</p>
        </section>

        <section className="rounded-2xl bg-proof p-5 text-white" aria-label={`${summary.hours} ${c.goal}`}>
          <p className="text-sm font-semibold text-white/80">{monthName}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="font-display text-5xl">{summary.hours}</strong>
            <span className="font-semibold">/ {MONTHLY_HOURS_TARGET}</span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, summary.hours / MONTHLY_HOURS_TARGET * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-white/90">{hoursLeft === 0 ? `✓ ${c.goalReached}` : `${hoursLeft} ${c.left}`}</p>
        </section>

        {!adding && <button onClick={() => setAdding(true)} aria-expanded="false" className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">+ {c.add}</button>}

        {adding && <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border/45 bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{c.formTitle}</h2>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 px-2 text-sm font-semibold text-text-muted underline">{c.cancel}</button>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{c.activity}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(LABELS) as ActivityType[]).map((value) => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={`min-h-12 rounded-xl border-2 px-3 text-sm font-semibold ${type === value ? "border-proof bg-proof/10 text-proof" : "border-border/60"}`}>{LABELS[value].icon} {LABELS[value][locale]}</button>)}
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm font-semibold">{c.organization}
            <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={c.organizationPlaceholder} className="min-h-12 rounded-xl border border-border bg-bg px-3 text-base font-normal" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-semibold">{c.date}<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-bg px-2 text-base font-normal" /></label>
            <label className="grid gap-1 text-sm font-semibold">{c.hoursLabel}<input required type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-bg px-3 text-base font-normal" /></label>
          </div>
          {type === "work" && <label className="grid gap-1 text-sm font-semibold">{c.earnings}
            <div className="flex min-h-12 items-center rounded-xl border border-border bg-bg px-3"><span>$</span><input type="number" min="0" step="0.01" value={earnings} onChange={(event) => setEarnings(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 text-base font-normal outline-none" /></div>
          </label>}
          <details className="rounded-xl bg-surface-2 px-3 py-2">
            <summary className="min-h-10 cursor-pointer content-center text-sm font-semibold">{c.addProof}</summary>
            <label className="mt-2 grid gap-1 text-sm font-semibold">{c.proof}<input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-h-12 rounded-xl border border-border bg-bg p-2 text-sm font-normal" /></label>
          </details>
          <button type="submit" className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">{c.save}</button>
        </form>}

        <section>
          <h2 className="font-display text-xl font-semibold">{c.recent}</h2>
          <p className="mt-1 text-sm text-text-muted">{c.recentHelp}</p>
          <div className="mt-2 grid gap-2">
            {currentEntries.length === 0 ? <div className="rounded-2xl bg-surface p-4"><p className="font-semibold">{c.emptyTitle}</p><p className="mt-1 text-sm text-text-muted">{c.empty}</p></div> : currentEntries.map((entry) => <article key={entry.id} className="rounded-2xl border border-border/40 bg-surface p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{entry.title}</p><p className="mt-0.5 text-sm text-text-muted">{LABELS[entry.type][locale]} · {entry.date}</p></div><strong className="whitespace-nowrap text-proof">{entry.hours} hrs</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3"><span className={`text-sm font-semibold ${entry.verified ? "text-proof" : "text-pace"}`}>{entry.verified ? `✓ ${c.verified}` : c.noProof}</span><button onClick={() => setEntries((current) => { const next = current.filter((item) => item.id !== entry.id); saveActivities(next); return next; })} className="min-h-12 px-2 text-sm text-text-muted underline">{c.delete}</button></div>
            </article>)}
          </div>
        </section>

        {currentEntries.length > 0 && <section className="rounded-2xl border border-border/40 bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{c.weekly}</h2>
            <button type="button" onClick={() => setShowEarningsInfo((shown) => !shown)} aria-expanded={showEarningsInfo} aria-label={c.earningsInfoLabel} className="flex size-12 shrink-0 items-center justify-center"><span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-2 font-display text-sm font-bold text-proof">i</span></button>
          </div>
          {showEarningsInfo && <div role="note" aria-label={c.earningsTitle} className="mt-3 rounded-xl border border-proof/35 bg-proof/10 p-3">
            <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-proof">{c.earningsTitle}</h3><button type="button" onClick={() => setShowEarningsInfo(false)} className="min-h-10 px-2 text-sm font-semibold text-text-muted underline">{c.closeInfo}</button></div>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{c.earningsHelp}</p>
          </div>}
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.weeklyHelp}</p>
          <details className="mt-2">
            <summary className="min-h-12 cursor-pointer content-center font-semibold text-proof underline">{c.weeklyToggle}</summary>
            <div className="mt-1 grid gap-2">{weeks.map((week) => {
              const gap = Math.max(0, WEEKLY_HOURS_TARGET - week.hours);
              return <div key={week.start} className="flex items-center justify-between gap-3 border-t border-border/30 py-3"><div><p className="font-semibold">{week.label}</p><p className="text-sm text-text-muted">{week.hours} hrs{week.earnings > 0 ? ` · $${week.earnings.toFixed(2)}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${week.status === "on-track" ? "bg-proof/10 text-proof" : "bg-surface-2 text-text-muted"}`}>{week.status === "on-track" ? c.onTrack : week.status === "upcoming" ? c.upcoming : `${gap} ${c.needs}`}</span></div>;
            })}</div>
          </details>
        </section>}

        <p className="text-sm leading-relaxed text-text-muted">{c.countyNote}</p>
      </main>
    </div>
  );
}
