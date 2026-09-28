"use client";

import { useState } from "react";

type Locale = "en" | "es";

type Props = {
  locale: Locale;
  organization: string;
  month: string;
  monthName: string;
  hours: number;
};

const COPY = {
  en: {
    button: "Prepare official CF 888",
    eyebrow: "Official California form · CF 888 (5/25)",
    title: "Fill the form for this organization",
    intro: "Make a draft with the organization, month, and hours. The organization representative must review Section 2 and sign it.",
    participant: "Your information",
    organization: "Organization information",
    name: "Full legal name",
    birthdate: "Birthdate",
    street: "Street address",
    city: "City, state, ZIP",
    organizationName: "Organization name",
    representative: "Authorized representative’s name",
    organizationAddress: "Organization address",
    phone: "Organization phone",
    ongoing: "I expect to keep volunteering here",
    prepare: "Download CF 888 draft",
    preparing: "Preparing form…",
    error: "We couldn’t prepare the form. Please try again or use the blank form.",
    nextTitle: "One more step: get a signature",
    next: "Ask the organization representative to review and sign the downloaded form. Then upload the signed copy in the Volunteering box above.",
  },
  es: {
    button: "Preparar el formulario oficial CF 888",
    eyebrow: "Formulario oficial de California · CF 888 (5/25)",
    title: "Llene el formulario para esta organización",
    intro: "Prepare un borrador con la organización, el mes y las horas. El representante de la organización debe revisar la Sección 2 y firmarla.",
    participant: "Su información",
    organization: "Información de la organización",
    name: "Nombre legal completo",
    birthdate: "Fecha de nacimiento",
    street: "Dirección",
    city: "Ciudad, estado, código postal",
    organizationName: "Nombre de la organización",
    representative: "Nombre del representante autorizado",
    organizationAddress: "Dirección de la organización",
    phone: "Teléfono de la organización",
    ongoing: "Espero seguir como voluntario aquí",
    prepare: "Descargar borrador del CF 888",
    preparing: "Preparando el formulario…",
    error: "No pudimos preparar el formulario. Inténtelo de nuevo o use el formulario en blanco.",
    nextTitle: "Falta un paso: obtener una firma",
    next: "Pida al representante de la organización que revise y firme el formulario descargado. Después, suba la copia firmada en la sección de Voluntariado arriba.",
  },
} as const;

export function Cf888Prep({ locale, organization, month, monthName, hours }: Props) {
  const c = COPY[locale];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState(false);
  const [values, setValues] = useState({
    name: "",
    birthdate: "",
    address1: "",
    address2: "",
    organization,
    representative: "",
    organizationAddress: "",
    phone: "",
    ongoing: true,
  });

  function update(key: keyof typeof values, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    setDownloaded(false);
    try {
      const response = await fetch("/api/cf888", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, address3: "", month: monthName, hours }),
      });
      if (!response.ok) throw new Error("Could not prepare CF 888");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const safeOrganization = values.organization.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "volunteer-organization";
      const link = document.createElement("a");
      link.href = url;
      link.download = `CF-888-${safeOrganization}-${month}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-12 w-full rounded-xl bg-proof px-4 text-sm font-bold text-white">{c.button}</button>;
  }

  return <form onSubmit={prepare} className="mt-3 rounded-xl border-2 border-proof/40 bg-bg p-3">
    <p className="text-xs font-bold uppercase tracking-[.1em] text-proof">{c.eyebrow}</p>
    <h4 className="mt-1 font-display text-lg font-semibold">{c.title}</h4>
    <p className="mt-1 text-sm leading-relaxed text-text-muted">{c.intro}</p>

    <fieldset className="mt-4 grid gap-3">
      <legend className="mb-2 font-semibold">{c.participant}</legend>
      <label className="grid gap-1 text-sm font-semibold">{c.name}<input required autoComplete="name" value={values.name} onChange={(event) => update("name", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.birthdate}<input required type="date" value={values.birthdate} onChange={(event) => update("birthdate", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.street}<input required autoComplete="street-address" value={values.address1} onChange={(event) => update("address1", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.city}<input required autoComplete="address-level2" value={values.address2} onChange={(event) => update("address2", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
    </fieldset>

    <fieldset className="mt-5 grid gap-3">
      <legend className="mb-2 font-semibold">{c.organization}</legend>
      <label className="grid gap-1 text-sm font-semibold">{c.organizationName}<input required value={values.organization} onChange={(event) => update("organization", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.representative}<input required value={values.representative} onChange={(event) => update("representative", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.organizationAddress}<input value={values.organizationAddress} onChange={(event) => update("organizationAddress", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="grid gap-1 text-sm font-semibold">{c.phone}<input type="tel" autoComplete="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal" /></label>
      <label className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3 text-sm font-semibold"><input type="checkbox" checked={values.ongoing} onChange={(event) => update("ongoing", event.target.checked)} className="size-5" />{c.ongoing}</label>
    </fieldset>

    <button disabled={busy} className="mt-4 min-h-14 w-full rounded-xl bg-proof px-4 font-bold text-white disabled:opacity-50">{busy ? c.preparing : c.prepare}</button>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-pace">{c.error}</p>}
    {downloaded && <div role="status" className="mt-3 rounded-xl bg-proof/10 p-3 text-sm leading-relaxed"><strong className="block text-proof">{c.nextTitle}</strong>{c.next}</div>}
  </form>;
}
