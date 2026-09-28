"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToolNav } from "@/components/ui/ToolNav";
import { deleteProofFile, listProofFiles, saveProofFile, type StoredProofFile } from "@/lib/activities/files";
import { loadActivities, onActivitiesChanged } from "@/lib/activities/store";
import { currentMonth, monthEntries } from "@/lib/activities/summary";
import type { ActivityEntry, ActivityType } from "@/lib/activities/types";
import { Cf888Prep } from "./Cf888Prep";

type Locale = "en" | "es";

const GROUPS: Array<{
  key: ActivityType;
  title: Record<Locale, string>;
  accepts: Record<Locale, string>;
  help: Record<Locale, string>;
}> = [
  {
    key: "work",
    title: { en: "Paid work", es: "Trabajo pagado" },
    accepts: { en: "Pay stub or employer letter", es: "Talón de pago o carta del empleador" },
    help: { en: "Use a document that shows your gross pay, dates, and hours when available.", es: "Use un documento que muestre su pago bruto, las fechas y las horas, si están disponibles." },
  },
  {
    key: "volunteer",
    title: { en: "Volunteering", es: "Voluntariado" },
    accepts: { en: "Signed CF 888 or similar signed verification", es: "CF 888 firmado u otra verificación firmada similar" },
    help: { en: "It should show your completed hours and be signed by an organization representative. You can prepare an official CF 888 below.", es: "Debe mostrar las horas completadas y tener la firma de un representante de la organización. Puede preparar un CF 888 oficial abajo." },
  },
  {
    key: "school",
    title: { en: "School", es: "Escuela" },
    accepts: { en: "Class schedule or enrollment record", es: "Horario de clases o registro de inscripción" },
    help: { en: "Use a record that shows your class time or enrollment status.", es: "Use un registro que muestre su horario de clases o estado de inscripción." },
  },
  {
    key: "training",
    title: { en: "Job training", es: "Capacitación laboral" },
    accepts: { en: "Program enrollment or attendance record", es: "Registro de inscripción o asistencia al programa" },
    help: { en: "Use a record with the program name, dates, and attendance or class hours.", es: "Use un registro con el nombre del programa, las fechas y las horas de asistencia o clase." },
  },
];

const COPY = {
  en: {
    eyebrow: "My documents",
    title: "Upload your proof",
    intro: "Add a photo or PDF for each kind of activity you did this month.",
    private: "Files stay on this device until you send them to your county.",
    emptyTitle: "Add your hours first",
    emptyBody: "Choose Hours above to add them. Then HourProof will show exactly what to upload.",
    ready: "Your upload checklist",
    complete: "All proof added",
    next: "Still needed",
    typesReady: "activity types have proof",
    uploadTitle: "Upload your documents",
    uploadHelp: "Use the matching box below. You can add more than one file.",
    added: "Proof added",
    missing: "Needed",
    hours: "hours logged",
    oneEntry: "entry",
    entries: "entries",
    why: "What should I upload?",
    choose: "Take photo or choose files",
    adding: "Adding…",
    remove: "Remove",
    file: "file",
    files: "files",
    cf888Title: "Official CF 888 forms",
    cf888Help: "Prepare one form for each volunteer organization. After its representative signs it, upload the signed form above.",
    blankCf888: "Use a blank CF 888 instead",
    sendTitle: "Ready to send your proof?",
    sendBody: "Open BenefitsCal and upload the original files listed here. HourProof stores them for you, but does not send them automatically.",
    openBenefitsCal: "Open BenefitsCal",
    countyNote: "HourProof helps organize your proof. Your county decides what it accepts and whether you are eligible.",
  },
  es: {
    eyebrow: "Mis documentos",
    title: "Suba sus comprobantes",
    intro: "Agregue una foto o un PDF por cada tipo de actividad que realizó este mes.",
    private: "Los archivos permanecen en este dispositivo hasta que los envíe a su condado.",
    emptyTitle: "Primero agregue sus horas",
    emptyBody: "Elija Horas arriba para agregarlas. Después, HourProof le mostrará exactamente qué subir.",
    ready: "Su lista de comprobantes",
    complete: "Agregó todos los comprobantes",
    next: "Aún necesita",
    typesReady: "tipos de actividad tienen comprobante",
    uploadTitle: "Suba sus documentos",
    uploadHelp: "Use la sección correspondiente abajo. Puede agregar más de un archivo.",
    added: "Comprobante agregado",
    missing: "Necesario",
    hours: "horas registradas",
    oneEntry: "registro",
    entries: "registros",
    why: "¿Qué debo subir?",
    choose: "Tomar foto o elegir archivos",
    adding: "Agregando…",
    remove: "Quitar",
    file: "archivo",
    files: "archivos",
    cf888Title: "Formularios oficiales CF 888",
    cf888Help: "Prepare un formulario por cada organización de voluntariado. Después de que el representante lo firme, suba el formulario firmado arriba.",
    blankCf888: "Usar un CF 888 en blanco",
    sendTitle: "¿Listo para enviar sus comprobantes?",
    sendBody: "Abra BenefitsCal y suba los archivos originales que aparecen aquí. HourProof los guarda, pero no los envía automáticamente.",
    openBenefitsCal: "Abrir BenefitsCal",
    countyNote: "HourProof ayuda a organizar sus comprobantes. Su condado decide qué acepta y si usted es elegible.",
  },
} as const;

export function ProofPacket() {
  const locale: Locale = useLocale() === "es" ? "es" : "en";
  const c = COPY[locale];
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [allFiles, setFiles] = useState<StoredProofFile[]>([]);
  const [uploading, setUploading] = useState<ActivityType | null>(null);

  async function refreshFiles() {
    try { setFiles(await listProofFiles()); } catch { setFiles([]); }
  }

  useEffect(() => {
    setEntries(loadActivities());
    refreshFiles();
    return onActivitiesChanged(() => setEntries(loadActivities()));
  }, []);

  const currentEntries = useMemo(() => monthEntries(entries, month), [entries, month]);
  const files = allFiles.filter((file) => file.month === month);
  const monthName = new Date(`${month}-02T12:00:00`).toLocaleDateString(locale === "es" ? "es-US" : "en-US", { month: "long", year: "numeric" });
  const usedTypes = new Set(currentEntries.map((entry) => entry.type));
  const neededGroups = GROUPS.filter((group) => usedTypes.has(group.key));
  const groupIsReady = (group: (typeof GROUPS)[number]) => files.some((file) => file.category === group.key);
  const readyGroups = neededGroups.filter(groupIsReady);
  const missingGroup = neededGroups.find((group) => !groupIsReady(group));
  const completeness = neededGroups.length === 0 ? 0 : Math.round(readyGroups.length / neededGroups.length * 100);

  async function upload(category: ActivityType, selected: File[]) {
    if (selected.length === 0) return;
    setUploading(category);
    try {
      for (const file of selected) await saveProofFile(file, category, month);
      await refreshFiles();
    } finally {
      setUploading(null);
    }
  }

  function download(file: StoredProofFile) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const volunteerOrganizations = useMemo(() => {
    const grouped = new Map<string, number>();
    currentEntries.filter((entry) => entry.type === "volunteer").forEach((entry) => grouped.set(entry.title, (grouped.get(entry.title) ?? 0) + entry.hours));
    return Array.from(grouped, ([organization, hours]) => ({ organization, hours }));
  }, [currentEntries]);

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="font-display text-base font-bold">HourProof</Link>
        <div className="flex items-center gap-1"><LanguageSwitch /><ThemeToggle /></div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12">
        <ToolNav current="proof" />

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-[.12em] text-proof">{c.eyebrow}</p>
            <label className="sr-only" htmlFor="proof-month">Month</label>
            <input id="proof-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="min-h-12 rounded-xl border border-border bg-surface px-2 text-sm font-semibold" />
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold">{c.title}</h1>
          <p className="mt-1 leading-relaxed text-text-muted">{c.intro}</p>
          <p className="mt-2 text-sm font-semibold text-proof">🔒 {c.private}</p>
        </section>

        {currentEntries.length === 0 ? <section className="rounded-2xl border border-border/45 bg-surface p-5 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-proof text-xl font-bold text-white">1</div>
          <h2 className="mt-3 font-display text-xl font-semibold">{c.emptyTitle}</h2>
          <p className="mt-2 leading-relaxed text-text-muted">{c.emptyBody}</p>
        </section> : <>
          <section className="rounded-2xl border border-border/45 bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-semibold">{c.ready}</p><p className="mt-1 text-sm text-text-muted">{missingGroup ? `${c.next}: ${missingGroup.accepts[locale]}` : c.complete}</p></div>
              <strong className="font-display text-2xl text-proof">{readyGroups.length}/{neededGroups.length}</strong>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-proof" style={{ width: `${completeness}%` }} /></div>
            <p className="mt-2 text-xs font-semibold text-text-muted">{readyGroups.length} {c.typesReady}</p>
          </section>

          <section className="min-w-0">
            <h2 className="font-display text-xl font-semibold">{c.uploadTitle}</h2>
            <p className="mt-1 text-sm text-text-muted">{c.uploadHelp}</p>
            <div className="mt-3 grid min-w-0 gap-3">{neededGroups.map((group) => {
              const groupEntries = currentEntries.filter((entry) => entry.type === group.key);
              const groupFiles = files.filter((file) => file.category === group.key);
              const isReady = groupIsReady(group);
              return <article key={group.key} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/45 bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="font-semibold">{group.title[locale]}</h3><p className="mt-1 break-words text-sm text-text-muted">{group.accepts[locale]}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${isReady ? "bg-proof/10 text-proof" : "bg-pace/10 text-pace"}`}>{isReady ? c.added : c.missing}</span>
                </div>
                <p className="mt-3 text-sm">{groupEntries.reduce((sum, entry) => sum + entry.hours, 0)} {c.hours} · {groupEntries.length} {groupEntries.length === 1 ? c.oneEntry : c.entries}</p>
                <details className="mt-2 text-sm text-text-muted"><summary className="min-h-10 cursor-pointer content-center font-semibold underline">{c.why}</summary><p className="pb-2 leading-relaxed">{group.help[locale]}</p></details>

                {groupFiles.length > 0 && <div className="mt-2 grid min-w-0 gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{groupFiles.length} {groupFiles.length === 1 ? c.file : c.files}</p>
                  {groupFiles.map((file) => <div key={file.id} className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-surface-2 px-3 py-2"><button type="button" onClick={() => download(file)} title={file.name} className="block min-h-10 min-w-0 max-w-full truncate text-left text-sm font-semibold text-proof underline">{file.name}</button><button type="button" onClick={async () => { await deleteProofFile(file.id); await refreshFiles(); }} aria-label={`${c.remove} ${file.name}`} className="min-h-10 shrink-0 whitespace-nowrap px-2 text-sm text-text-muted underline">{c.remove}</button></div>)}
                </div>}

                <label className="mt-3 flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-proof bg-bg px-3 text-center text-sm font-bold text-proof">{uploading === group.key ? c.adding : `+ ${c.choose}`}<input aria-label={`${c.choose}: ${group.title[locale]}`} type="file" accept="image/*,.pdf" multiple className="sr-only" onChange={async (event) => { const input = event.currentTarget; await upload(group.key, Array.from(input.files ?? [])); input.value = ""; }} /></label>

                {group.key === "volunteer" && <div className="mt-4 border-t border-border/40 pt-4">
                  <h4 className="font-semibold">{c.cf888Title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{c.cf888Help}</p>
                  <div className="mt-3 grid gap-3">{volunteerOrganizations.map((item) => <Cf888Prep key={item.organization} locale={locale} organization={item.organization} month={month} monthName={monthName} hours={item.hours} />)}</div>
                  <a href="/forms/cf888-template.pdf" download className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-surface-2 px-3 text-center text-sm font-semibold underline">{c.blankCf888}</a>
                </div>}
              </article>;
            })}</div>
          </section>

          <section className="rounded-2xl bg-surface-2 p-4">
            <h2 className="font-display text-lg font-semibold">{c.sendTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.sendBody}</p>
            <a href="https://benefitscal.com/" target="_blank" rel="noreferrer" className="mt-4 flex min-h-14 items-center justify-center rounded-2xl border-2 border-border bg-surface px-4 text-center font-bold">{c.openBenefitsCal} →</a>
          </section>
        </>}

        <p className="text-sm leading-relaxed text-text-muted">{c.countyNote}</p>
      </main>
    </div>
  );
}
