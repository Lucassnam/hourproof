"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { ToolNav } from "@/components/ui/ToolNav";
import { InfoTip } from "@/components/ui/InfoTip";
import { SAMPLE_SHIFTS, SHIFT_DATA_NOTICE } from "@/lib/shiftcred/sample-data";
import { loadShiftRecords, saveShiftRecords } from "@/lib/shiftcred/store";
import type { Shift, ShiftRecord } from "@/lib/shiftcred/types";
import { getMode, openStore } from "@/lib/hours/store";
import { ShiftMap } from "./ShiftMap";
import { KitchenPortal } from "./KitchenPortal";

type View = "find" | "detail" | "reserved" | "scan" | "supervisor" | "hours";
const COPY = {
  en: {
    back: "Back",
    demo: "Demo preview",
    brandLine: "Verified volunteer hours",
    find: "Available shifts",
    hours: "Verified shifts",
    headline: "Volunteer nearby. Keep proof of every hour.",
    intro: "Reserve a shift, check in at the kitchen, and get a supervisor-confirmed record for CalFresh.",
    infoLabel: "How ShiftCred works",
    needs: "Open shifts near Mountain View",
    spots: "spots left",
    viewShift: "View shift",
    sample: "Sample listings — not live opportunities",
    about: "About this shift",
    location: "Location",
    language: "Languages",
    access: "Accessibility",
    reserve: "Reserve this shift",
    reserved: "You’re signed up",
    reservedBody: "We saved this shift on this phone. At the kitchen, open ShiftCred and scan the posted code.",
    addCalendar: "Add to calendar",
    demoCheckIn: "Try demo check-in",
    browse: "Find another shift",
    scanTitle: "Scan the kitchen’s code",
    scanBody: "In a live kitchen, the camera reads a signed QR code posted at the volunteer desk. This preview simulates that scan.",
    privacy: "No GPS tracking. The code confirms the kitchen and shift—not your location.",
    privacyLabel: "About QR check-in privacy",
    scanButton: "Simulate QR scan",
    checkedIn: "Checked in",
    checkedBody: "Your start time is recorded. A kitchen supervisor confirms the shift when service ends.",
    finish: "Simulate end of shift",
    supervisorTitle: "Supervisor confirmation",
    supervisorBody: "Please check the volunteer’s shift before confirming.",
    confirm: "Confirm 4 hours",
    confirming: "Saving verified hours…",
    verified: "Verified",
    proofTitle: "Kitchen-confirmed hours",
    proofBody: "Confirmed shifts are also saved in Hours. Use Documents to prepare proof for your county.",
    proofInfoLabel: "About verified hours",
    noHours: "No verified shifts yet.",
    saveError: "We couldn't add this shift to Hours. Please try again.",
    statusReserved: "Reserved",
    statusChecked: "Checked in",
    statusVerified: "Verified",
  },
  es: {
    back: "Atrás",
    demo: "Vista de demostración",
    brandLine: "Horas de voluntariado verificadas",
    find: "Turnos disponibles",
    hours: "Turnos verificados",
    headline: "Sea voluntario cerca. Guarde prueba de cada hora.",
    intro: "Reserve un turno, registre su llegada en la cocina y obtenga un registro confirmado para CalFresh.",
    infoLabel: "Cómo funciona ShiftCred",
    needs: "Turnos disponibles cerca de Mountain View",
    spots: "lugares disponibles",
    viewShift: "Ver turno",
    sample: "Ejemplos — no son oportunidades activas",
    about: "Sobre este turno",
    location: "Ubicación",
    language: "Idiomas",
    access: "Accesibilidad",
    reserve: "Reservar este turno",
    reserved: "Su turno está reservado",
    reservedBody: "Guardamos este turno en este teléfono. En la cocina, abra ShiftCred y escanee el código publicado.",
    addCalendar: "Añadir al calendario",
    demoCheckIn: "Probar registro de llegada",
    browse: "Buscar otro turno",
    scanTitle: "Escanee el código de la cocina",
    scanBody: "En una cocina real, la cámara lee un código QR firmado en la mesa de voluntarios. Esta vista simula el escaneo.",
    privacy: "Sin rastreo GPS. El código confirma la cocina y el turno, no su ubicación.",
    privacyLabel: "Acerca de la privacidad del código QR",
    scanButton: "Simular escaneo QR",
    checkedIn: "Llegada registrada",
    checkedBody: "Se registró la hora de inicio. Un supervisor confirma el turno cuando termina el servicio.",
    finish: "Simular fin del turno",
    supervisorTitle: "Confirmación del supervisor",
    supervisorBody: "Revise el turno de la persona voluntaria antes de confirmar.",
    confirm: "Confirmar 4 horas",
    confirming: "Guardando horas verificadas…",
    verified: "Verificado",
    proofTitle: "Horas confirmadas por la organización",
    proofBody: "Los turnos confirmados también se guardan en Horas. Use Documentos para preparar comprobantes para su condado.",
    proofInfoLabel: "Acerca de las horas verificadas",
    noHours: "Aún no hay turnos verificados.",
    saveError: "No pudimos agregar este turno a Horas. Inténtelo de nuevo.",
    statusReserved: "Reservado",
    statusChecked: "Llegada registrada",
    statusVerified: "Verificado",
  },
} as const;

type Copy = { [Key in keyof typeof COPY.en]: string };

function Icon({ name }: { name: "pin" | "bus" | "clock" | "check" | "qr" }) {
  const paths = {
    pin: <><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></>,
    bus: <><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21v-3m8 3v-3M8 7h.01M16 7h.01"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    qr: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M15 14h2v2h-2zm3 3h2v3h-3v-2m-3 1h2v1h-2z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function statusLabel(record: ShiftRecord | undefined, c: Copy) {
  if (record?.status === "verified") return c.statusVerified;
  if (record?.status === "checked-in") return c.statusChecked;
  if (record?.status === "reserved") return c.statusReserved;
  return null;
}

export function ShiftCred() {
  const locale = useLocale();
  const c: Copy = locale === "es" ? COPY.es : COPY.en;
  const [view, setView] = useState<View>("find");
  const [selectedId, setSelectedId] = useState(SAMPLE_SHIFTS[0].id);
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [audience, setAudience] = useState<"volunteer" | "kitchen">("volunteer");
  const [languageFilter, setLanguageFilter] = useState<"All" | "Spanish" | "Mandarin">("All");
  const [transitOnly, setTransitOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => { setRecords(loadShiftRecords()); setReady(true); }, []);
  useEffect(() => { if (ready) saveShiftRecords(records); }, [records, ready]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [view, audience]);

  const selected = SAMPLE_SHIFTS.find((shift) => shift.id === selectedId) ?? SAMPLE_SHIFTS[0];
  const record = records.find((item) => item.shiftId === selected.id);
  const verified = useMemo(() => records.filter((item) => item.status === "verified"), [records]);
  const verifiedHours = verified.reduce((total, item) => total + (SAMPLE_SHIFTS.find((s) => s.id === item.shiftId)?.hours ?? 0), 0);
  const visibleShifts = SAMPLE_SHIFTS.filter((shift) => (languageFilter === "All" || shift.languages.includes(languageFilter)) && (!transitOnly || shift.transitMinutes <= 5));

  function updateRecord(status: ShiftRecord["status"]) {
    const now = new Date().toISOString();
    setRecords((current) => {
      const existing = current.find((item) => item.shiftId === selected.id);
      const next: ShiftRecord = {
        shiftId: selected.id,
        status,
        reservedAt: existing?.reservedAt ?? now,
        checkedInAt: status === "checked-in" || status === "verified" ? existing?.checkedInAt ?? now : undefined,
        verifiedAt: status === "verified" ? now : undefined,
      };
      return [...current.filter((item) => item.shiftId !== selected.id), next];
    });
  }

  async function verifySelectedShift() {
    if (confirming) return;
    setConfirming(true);
    setSaveError("");
    const verifiedAt = new Date().toISOString();
    try {
      const store = await openStore(getMode());
      await store.put({
        id: `shiftcred:${selected.id}`,
        date: selected.date,
        type: "volunteer",
        hours: selected.hours,
        place: selected.kitchen,
        note: `ShiftCred sample · Confirmed by ${selected.supervisor}`,
        createdAt: verifiedAt,
      });
      updateRecord("verified");
      go("hours");
    } catch {
      setSaveError(c.saveError);
    } finally {
      setConfirming(false);
    }
  }

  function openShift(shift: Shift) { setSelectedId(shift.id); setView("detail"); window.scrollTo(0, 0); }
  function go(next: View) { setView(next); window.scrollTo(0, 0); }
  function switchAudience(next: "volunteer" | "kitchen") { setAudience(next); window.scrollTo(0, 0); }
  function back() {
    const previous: Record<View, View> = { find: "find", detail: "find", reserved: "detail", scan: "reserved", supervisor: "scan", hours: "find" };
    go(previous[view]);
  }

  const nav = (
    <nav aria-label="ShiftCred" className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1">
      <button onClick={() => go("find")} className={`min-h-12 rounded-xl px-3 font-semibold ${view !== "hours" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}>{c.find}</button>
      <button onClick={() => go("hours")} className={`min-h-12 rounded-xl px-3 font-semibold ${view === "hours" ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}>{c.hours}{verifiedHours > 0 && <span className="ml-2 rounded-full bg-proof px-2 py-0.5 text-sm text-white">{verifiedHours}</span>}</button>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3 print:hidden">
        <Link href="/" className="whitespace-nowrap font-display text-base font-bold tracking-tight">HourProof <span className="text-proof">/ ShiftCred</span></Link>
        <div className="flex items-center gap-1"><LanguageSwitch /><ThemeToggle /></div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12">
        <ToolNav current="shiftcred" />
        {audience === "kitchen" ? <KitchenPortal onExit={() => switchAudience("volunteer")}/> : <>
        {view === "find" && <div className="rounded-xl border border-pace/40 bg-pace/10 px-3 py-2 text-sm leading-snug print:hidden"><span className="font-bold">{c.demo}:</span> {locale === "es" ? "Todos los turnos y organizaciones son ejemplos fáciles de reemplazar." : SHIFT_DATA_NOTICE}</div>}
        {view !== "find" && view !== "hours" && <button onClick={back} className="flex min-h-12 items-center self-start font-semibold text-text-muted underline underline-offset-4 print:hidden">← {c.back}</button>}
        {view === "find" && <>
          <section className="pt-2">
            <p className="text-sm font-bold uppercase tracking-[.12em] text-proof">ShiftCred · {c.brandLine}</p>
            <div className="mt-2 flex items-start gap-1">
              <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold leading-tight">{c.headline}</h1>
              <InfoTip label={c.infoLabel} testId="shiftcred-info"><p>{c.intro}</p></InfoTip>
            </div>
          </section>
          {nav}
          <button onClick={() => switchAudience("kitchen")} className="flex min-h-12 items-center justify-between rounded-2xl border border-border/50 bg-surface px-4 text-left text-sm font-semibold"><span><span className="block text-text">Run a kitchen or pantry?</span><span className="font-normal text-text-muted">Post shifts and make a QR code</span></span><span aria-hidden="true">→</span></button>
          <section>
            <h2 className="mb-3 font-display text-xl font-semibold">{c.needs}</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-text-muted">Language<select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value as typeof languageFilter)} className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal text-text"><option>All</option><option>Spanish</option><option>Mandarin</option></select></label>
              <label className="mt-5 flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"><input type="checkbox" checked={transitOnly} onChange={(e) => setTransitOnly(e.target.checked)} className="size-5"/> Near transit</label>
            </div>
            <div className="mb-3"><ShiftMap shifts={visibleShifts} selectedId={selectedId} onSelect={openShift}/></div>
            <div className="flex flex-col gap-3">
              {visibleShifts.map((shift) => {
                const itemRecord = records.find((item) => item.shiftId === shift.id);
                return <article key={shift.id} className="rounded-2xl border border-border/45 bg-surface p-4">
                  <div className="flex items-start justify-between gap-4"><div><p className="font-bold text-proof">{shift.dateLabel}</p><h3 className="mt-1 font-display text-xl font-bold">{shift.role}</h3><p className="mt-1 text-text-muted">{shift.kitchen}</p></div><div className="rounded-2xl bg-proof/10 px-3 py-2 text-center text-proof"><strong className="block text-xl">{shift.hours}</strong><span className="text-sm">hrs</span></div></div>
                  <div className="mt-3 grid gap-1.5 text-sm text-text-muted"><p className="flex gap-2"><Icon name="clock"/>{shift.time}</p><p className="flex gap-2"><Icon name="bus"/>{shift.transit}</p><p className="flex gap-2"><Icon name="pin"/>{shift.spotsLeft} {c.spots}</p></div>
                  <button onClick={() => openShift(shift)} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-border bg-surface-2 px-4 font-bold">{statusLabel(itemRecord, c) ?? c.viewShift} →</button>
                </article>;
              })}
            </div>
          </section>
        </>}

        {view === "detail" && <section className="flex flex-col gap-4">
          <div><p className="text-sm font-bold text-proof">{selected.dateLabel} · {selected.time}</p><h1 className="mt-1 font-display text-2xl font-semibold">{selected.role}</h1><p className="mt-1 text-text-muted">{selected.kitchen}</p></div>
          <div className="rounded-2xl border border-border/40 bg-surface p-4"><h2 className="font-display text-xl font-semibold">{c.about}</h2><p className="mt-2 leading-relaxed">{selected.description}</p><dl className="mt-4 grid gap-3"><div><dt className="font-bold">{c.location}</dt><dd className="mt-1 text-sm text-text-muted">{selected.address}<br/>{selected.transit}</dd></div><div><dt className="font-bold">{c.language}</dt><dd className="mt-1 text-sm text-text-muted">{selected.languages.join(" · ")}</dd></div><div><dt className="font-bold">{c.access}</dt><dd className="mt-1 text-sm text-text-muted">{selected.accessibility}</dd></div></dl></div>
          <button onClick={() => { updateRecord("reserved"); go("reserved"); }} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">{record ? c.statusReserved : c.reserve}</button>
        </section>}

        {view === "reserved" && <section className="flex flex-col gap-4 text-center"><div className="mx-auto flex size-16 items-center justify-center rounded-full bg-proof text-white"><Icon name="check"/></div><div><p className="text-sm font-bold text-proof">{selected.dateLabel} · {selected.time}</p><h1 className="mt-1 font-display text-2xl font-semibold">{c.reserved}</h1><p className="mt-2 text-text-muted">{c.reservedBody}</p></div><div className="rounded-2xl border border-border/40 bg-surface p-4 text-left"><h2 className="font-display text-xl font-semibold">{selected.role}</h2><p className="mt-1 text-sm text-text-muted">{selected.kitchen}</p><p className="mt-3 flex gap-2 text-sm"><Icon name="pin"/>{selected.address}</p></div><button onClick={() => go("scan")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">{c.demoCheckIn}</button><button onClick={() => go("find")} className="min-h-12 font-semibold text-text-muted underline">{c.browse}</button></section>}

        {view === "scan" && <section className="flex flex-col gap-5 text-center"><div className="mx-auto flex size-28 items-center justify-center rounded-3xl border-4 border-proof bg-surface text-proof"><svg aria-label="Sample QR code" viewBox="0 0 21 21" className="size-20 fill-current"><path d="M1 1h7v7H1zm2 2v3h3V3zm10-2h7v7h-7zm2 2v3h3V3zM1 13h7v7H1zm2 2v3h3v-3zm7-14h2v3h-2zm0 5h2v4h3v2h-5zm7 4h3v2h-3zm-7 3h3v2h2v-2h2v5h-3v-2h-4zm8 1h2v6h-2z"/></svg></div><div><div className="flex items-start justify-center gap-1"><h1 className="font-display text-3xl font-bold">{record?.status === "checked-in" ? c.checkedIn : c.scanTitle}</h1><InfoTip label={c.privacyLabel}><p className="text-left">{c.privacy}</p></InfoTip></div><p className="mt-3 text-lg text-text-muted">{record?.status === "checked-in" ? c.checkedBody : c.scanBody}</p></div>{record?.status === "checked-in" ? <button onClick={() => go("supervisor")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-6 text-lg font-bold text-white">{c.finish}</button> : <button onClick={() => updateRecord("checked-in")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-6 text-lg font-bold text-white"><span className="flex items-center justify-center gap-2"><Icon name="qr"/>{c.scanButton}</span></button>}</section>}

        {view === "supervisor" && <section className="flex flex-col gap-5"><div className="text-center"><p className="text-sm font-bold uppercase tracking-[.15em] text-signal">ShiftCred · {c.demo}</p><h1 className="mt-3 font-display text-3xl font-bold">{c.supervisorTitle}</h1><p className="mt-2 text-text-muted">{c.supervisorBody}</p></div><div className="rounded-3xl border border-border/45 bg-surface p-5"><p className="text-text-muted">Volunteer</p><p className="font-display text-xl font-bold">Demo volunteer</p><hr className="my-4 border-border/30"/><p className="font-bold">{selected.role}</p><p className="mt-1 text-text-muted">{selected.kitchen}</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-2 p-3"><p className="text-sm text-text-muted">Check in</p><p className="font-bold">{selected.startTime}</p></div><div className="rounded-2xl bg-surface-2 p-3"><p className="text-sm text-text-muted">Check out</p><p className="font-bold">{selected.endTime}</p></div></div></div><p role="alert" className="text-center font-semibold text-danger empty:hidden">{saveError}</p><button onClick={verifySelectedShift} disabled={confirming} className="min-h-14 rounded-2xl border-2 border-border bg-signal px-6 text-lg font-bold text-white disabled:opacity-60">{confirming ? c.confirming : c.confirm}</button></section>}

        {view === "hours" && <><div className="print:hidden">{nav}</div><section className="rounded-2xl border-2 border-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[.14em] text-proof">ShiftCred</p><div className="mt-1 flex items-start gap-1"><h1 className="font-display text-2xl font-bold">{c.proofTitle}</h1><InfoTip label={c.proofInfoLabel}><p>{c.proofBody}</p></InfoTip></div></div><div className="shrink-0 rounded-full bg-proof/10 px-3 py-1 font-bold text-proof">{verifiedHours} hrs</div></div><div className="mt-4 flex flex-col gap-3">{verified.length === 0 ? <p className="rounded-2xl bg-surface-2 p-4">{c.noHours}</p> : verified.map((item) => { const shift = SAMPLE_SHIFTS.find((s) => s.id === item.shiftId); if (!shift) return null; return <article key={item.shiftId} className="rounded-2xl border border-border/40 p-4"><div className="flex justify-between gap-4"><div><p className="font-bold">{shift.role}</p><p className="text-text-muted">{shift.kitchen}</p></div><strong className="text-xl text-proof">{shift.hours} hrs</strong></div><p className="mt-3 text-sm text-text-muted">{shift.dateLabel} · {shift.time}</p><p className="mt-2 flex items-center gap-2 font-semibold text-proof"><Icon name="check"/>{c.verified} · {shift.supervisor}</p></article>; })}</div></section></>}
        </>}
      </main>
    </div>
  );
}
