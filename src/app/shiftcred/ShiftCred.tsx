"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { ToolNav } from "@/components/ui/ToolNav";
import { InfoTip } from "@/components/ui/InfoTip";
import { SAMPLE_SHIFTS } from "@/lib/shiftcred/sample-data";
import { loadShiftRecords, saveShiftRecords } from "@/lib/shiftcred/store";
import type { Shift, ShiftRecord } from "@/lib/shiftcred/types";
import { getMode, openStore } from "@/lib/hours/store";
import { ShiftMap } from "./ShiftMap";
import { KitchenPortal } from "./KitchenPortal";
import { VolunteerMenu } from "./VolunteerMenu";

type View = "find" | "detail" | "reserved" | "scan" | "supervisor" | "hours";
const COPY = {
  en: {
    back: "Back",
    demo: "Demo",
    find: "Find shifts",
    hours: "Verified shifts",
    headline: "Volunteer nearby. Keep proof of every hour.",
    intro: "Reserve a shift, check in at the kitchen, and get a supervisor-confirmed record for CalFresh.",
    infoLabel: "How ShiftCred works",
    needs: "Volunteer shifts near Mountain View",
    openMenu: "Open volunteer menu",
    closeMenu: "Close menu",
    menu: "Volunteer menu",
    kitchen: "Run a kitchen or pantry?",
    kitchenHelp: "Post shifts and make a QR code",
    listView: "List",
    mapView: "Map",
    viewLabel: "View",
    filterLanguage: "Language",
    allLanguages: "All",
    nearTransit: "Near transit",
    noMatches: "No sample shifts match these filters.",
    spots: "spots left",
    viewShift: "View shift",
    sample: "Sample shifts only — not live opportunities or partner listings.",
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
    demo: "Demostración",
    find: "Buscar turnos",
    hours: "Turnos verificados",
    headline: "Sea voluntario cerca. Guarde prueba de cada hora.",
    intro: "Reserve un turno, registre su llegada en la cocina y obtenga un registro confirmado para CalFresh.",
    infoLabel: "Cómo funciona ShiftCred",
    needs: "Turnos de voluntariado cerca de Mountain View",
    openMenu: "Abrir menú de voluntariado",
    closeMenu: "Cerrar menú",
    menu: "Menú de voluntariado",
    kitchen: "¿Dirige una cocina o despensa?",
    kitchenHelp: "Publique turnos y cree un código QR",
    listView: "Lista",
    mapView: "Mapa",
    viewLabel: "Vista",
    filterLanguage: "Idioma",
    allLanguages: "Todos",
    nearTransit: "Cerca del transporte",
    noMatches: "Ningún turno de ejemplo coincide con estos filtros.",
    spots: "lugares disponibles",
    viewShift: "Ver turno",
    sample: "Solo turnos de ejemplo — no son oportunidades activas ni organizaciones asociadas.",
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
  const [showMap, setShowMap] = useState(false);
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

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 px-4 py-3 print:hidden">
        <Link href="/" className="whitespace-nowrap font-display text-base font-bold tracking-tight">HourProof</Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
          <VolunteerMenu
            labels={{ open: c.openMenu, close: c.closeMenu, title: c.menu, find: c.find, hours: c.hours, kitchen: c.kitchen, kitchenHelp: c.kitchenHelp }}
            verifiedHours={verifiedHours}
            onFind={() => { switchAudience("volunteer"); go("find"); }}
            onHours={() => { switchAudience("volunteer"); go("hours"); }}
            onKitchen={() => switchAudience("kitchen")}
          />
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12">
        <ToolNav current="shiftcred" />
        {audience === "kitchen" ? <KitchenPortal onExit={() => switchAudience("volunteer")}/> : <>
        {view === "find" && <p className="text-sm leading-snug text-pace print:hidden"><span className="font-bold">{c.demo}:</span> {c.sample}</p>}
        {view !== "find" && view !== "hours" && <button onClick={back} className="flex min-h-12 items-center self-start font-semibold text-text-muted underline underline-offset-4 print:hidden">← {c.back}</button>}
        {view === "find" && <>
          <section className="flex items-center gap-1 pt-1">
            <h1 id="shift-list-title" className="min-w-0 flex-1 font-display text-2xl font-semibold leading-tight">{c.needs}</h1>
            <InfoTip label={c.infoLabel} testId="shiftcred-info"><div className="flex flex-col gap-2"><p className="font-semibold">{c.headline}</p><p>{c.intro}</p></div></InfoTip>
          </section>
          <section aria-labelledby="shift-list-title">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-text-muted">{c.filterLanguage}<select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value as typeof languageFilter)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal text-text"><option value="All">{c.allLanguages}</option><option value="Spanish">Español</option><option value="Mandarin">中文</option></select></label>
              <button type="button" aria-pressed={transitOnly} onClick={() => setTransitOnly((current) => !current)} className={`mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${transitOnly ? "border-proof bg-proof/10 text-proof" : "border-border bg-surface text-text"}`}><Icon name="bus"/>{c.nearTransit}</button>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold" role="group" aria-label={c.viewLabel}>
                <button type="button" aria-pressed={!showMap} onClick={() => setShowMap(false)} className={`min-h-10 rounded-lg px-4 ${!showMap ? "bg-surface shadow-sm" : "text-text-muted"}`}>{c.listView}</button>
                <button type="button" aria-pressed={showMap} onClick={() => setShowMap(true)} className={`min-h-10 rounded-lg px-4 ${showMap ? "bg-surface shadow-sm" : "text-text-muted"}`}>{c.mapView}</button>
              </div>
            </div>
            {showMap ? <div className="mt-3"><ShiftMap shifts={visibleShifts} selectedId={selectedId} onSelect={openShift}/></div> : <div className="mt-3 divide-y divide-border/40 border-y border-border/40">
              {visibleShifts.length === 0 && <p className="py-6 text-center text-text-muted">{c.noMatches}</p>}
              {visibleShifts.map((shift) => {
                const itemRecord = records.find((item) => item.shiftId === shift.id);
                return <article key={shift.id}>
                  <button onClick={() => openShift(shift)} aria-label={`${c.viewShift}: ${shift.role}, ${shift.kitchen}`} className="flex min-h-32 w-full items-center gap-3 py-4 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-proof">{shift.dateLabel} · {shift.time}</span>
                      <span className="mt-1 block font-display text-xl font-semibold">{shift.role}</span>
                      <span className="mt-0.5 block text-sm text-text-muted">{shift.kitchen}</span>
                      <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm text-text-muted"><span>{shift.hours} hrs</span><span aria-hidden="true">·</span><span>{shift.transit}</span><span aria-hidden="true">·</span><span>{shift.spotsLeft} {c.spots}</span></span>
                      {statusLabel(itemRecord, c) && <span className="mt-2 inline-block rounded-full bg-proof/10 px-2 py-1 text-xs font-bold text-proof">{statusLabel(itemRecord, c)}</span>}
                    </span>
                    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl text-text-muted">→</span>
                  </button>
                </article>;
              })}
            </div>}
          </section>
          <footer className="mt-5 border-t border-border/40 pt-5">
            <button onClick={() => switchAudience("kitchen")} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-2 text-left hover:bg-surface-2">
              <span><span className="block font-semibold">{c.kitchen}</span><span className="mt-0.5 block text-sm text-text-muted">{c.kitchenHelp}</span></span><span aria-hidden="true" className="text-xl">→</span>
            </button>
          </footer>
        </>}

        {view === "detail" && <section className="flex flex-col gap-4">
          <div><p className="text-sm font-bold text-proof">{selected.dateLabel} · {selected.time}</p><h1 className="mt-1 font-display text-2xl font-semibold">{selected.role}</h1><p className="mt-1 text-text-muted">{selected.kitchen}</p></div>
          <div className="rounded-2xl border border-border/40 bg-surface p-4"><h2 className="font-display text-xl font-semibold">{c.about}</h2><p className="mt-2 leading-relaxed">{selected.description}</p><dl className="mt-4 grid gap-3"><div><dt className="font-bold">{c.location}</dt><dd className="mt-1 text-sm text-text-muted">{selected.address}<br/>{selected.transit}</dd></div><div><dt className="font-bold">{c.language}</dt><dd className="mt-1 text-sm text-text-muted">{selected.languages.join(" · ")}</dd></div><div><dt className="font-bold">{c.access}</dt><dd className="mt-1 text-sm text-text-muted">{selected.accessibility}</dd></div></dl></div>
          <button onClick={() => { updateRecord("reserved"); go("reserved"); }} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">{record ? c.statusReserved : c.reserve}</button>
        </section>}

        {view === "reserved" && <section className="flex flex-col gap-4 text-center"><div className="mx-auto flex size-16 items-center justify-center rounded-full bg-proof text-white"><Icon name="check"/></div><div><p className="text-sm font-bold text-proof">{selected.dateLabel} · {selected.time}</p><h1 className="mt-1 font-display text-2xl font-semibold">{c.reserved}</h1><p className="mt-2 text-text-muted">{c.reservedBody}</p></div><div className="rounded-2xl border border-border/40 bg-surface p-4 text-left"><h2 className="font-display text-xl font-semibold">{selected.role}</h2><p className="mt-1 text-sm text-text-muted">{selected.kitchen}</p><p className="mt-3 flex gap-2 text-sm"><Icon name="pin"/>{selected.address}</p></div><button onClick={() => go("scan")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white">{c.demoCheckIn}</button><button onClick={() => go("find")} className="min-h-12 font-semibold text-text-muted underline">{c.browse}</button></section>}

        {view === "scan" && <section className="flex flex-col gap-5 text-center"><div className="mx-auto flex size-28 items-center justify-center rounded-3xl border-4 border-proof bg-surface text-proof"><svg aria-label="Sample QR code" viewBox="0 0 21 21" className="size-20 fill-current"><path d="M1 1h7v7H1zm2 2v3h3V3zm10-2h7v7h-7zm2 2v3h3V3zM1 13h7v7H1zm2 2v3h3v-3zm7-14h2v3h-2zm0 5h2v4h3v2h-5zm7 4h3v2h-3zm-7 3h3v2h2v-2h2v5h-3v-2h-4zm8 1h2v6h-2z"/></svg></div><div><div className="flex items-start justify-center gap-1"><h1 className="font-display text-3xl font-bold">{record?.status === "checked-in" ? c.checkedIn : c.scanTitle}</h1><InfoTip label={c.privacyLabel}><p className="text-left">{c.privacy}</p></InfoTip></div><p className="mt-3 text-lg text-text-muted">{record?.status === "checked-in" ? c.checkedBody : c.scanBody}</p></div>{record?.status === "checked-in" ? <button onClick={() => go("supervisor")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-6 text-lg font-bold text-white">{c.finish}</button> : <button onClick={() => updateRecord("checked-in")} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-6 text-lg font-bold text-white"><span className="flex items-center justify-center gap-2"><Icon name="qr"/>{c.scanButton}</span></button>}</section>}

        {view === "supervisor" && <section className="flex flex-col gap-5"><div className="text-center"><h1 className="font-display text-3xl font-bold">{c.supervisorTitle}</h1><p className="mt-2 text-text-muted">{c.supervisorBody}</p></div><div className="rounded-3xl border border-border/45 bg-surface p-5"><p className="text-text-muted">Volunteer</p><p className="font-display text-xl font-bold">Demo volunteer</p><hr className="my-4 border-border/30"/><p className="font-bold">{selected.role}</p><p className="mt-1 text-text-muted">{selected.kitchen}</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-2 p-3"><p className="text-sm text-text-muted">Check in</p><p className="font-bold">{selected.startTime}</p></div><div className="rounded-2xl bg-surface-2 p-3"><p className="text-sm text-text-muted">Check out</p><p className="font-bold">{selected.endTime}</p></div></div></div><p role="alert" className="text-center font-semibold text-danger empty:hidden">{saveError}</p><button onClick={verifySelectedShift} disabled={confirming} className="min-h-14 rounded-2xl border-2 border-border bg-signal px-6 text-lg font-bold text-white disabled:opacity-60">{confirming ? c.confirming : c.confirm}</button></section>}

        {view === "hours" && <section className="rounded-2xl border-2 border-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-1"><h1 className="font-display text-2xl font-bold">{c.proofTitle}</h1><InfoTip label={c.proofInfoLabel}><p>{c.proofBody}</p></InfoTip></div><div className="shrink-0 rounded-full bg-proof/10 px-3 py-1 font-bold text-proof">{verifiedHours} hrs</div></div><div className="mt-4 flex flex-col gap-3">{verified.length === 0 ? <p className="rounded-2xl bg-surface-2 p-4">{c.noHours}</p> : verified.map((item) => { const shift = SAMPLE_SHIFTS.find((s) => s.id === item.shiftId); if (!shift) return null; return <article key={item.shiftId} className="rounded-2xl border border-border/40 p-4"><div className="flex justify-between gap-4"><div><p className="font-bold">{shift.role}</p><p className="text-text-muted">{shift.kitchen}</p></div><strong className="text-xl text-proof">{shift.hours} hrs</strong></div><p className="mt-3 text-sm text-text-muted">{shift.dateLabel} · {shift.time}</p><p className="mt-2 flex items-center gap-2 font-semibold text-proof"><Icon name="check"/>{c.verified} · {shift.supervisor}</p></article>; })}</div></section>}
        </>}
      </main>
    </div>
  );
}
