"use client";

import { useState } from "react";

export type ProofDefaults = { organization: string; representative: string; organizationAddress: string; phone: string; month: string; hours: number };

export function ProofForm({ defaults }: { defaults: ProofDefaults }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [person, setPerson] = useState({ name: "", birthdate: "", address1: "", address2: "", address3: "" });

  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/cf888", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...defaults, ...person, ongoing: true }) });
      if (!response.ok) throw new Error("Could not prepare the form");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "CF-888-volunteer-hours-filled.pdf"; link.click(); URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="min-h-14 rounded-2xl border-2 border-border bg-proof px-5 font-bold text-white print:hidden">Prepare official CF 888</button>;
  return <section className="rounded-2xl border-2 border-proof bg-surface p-4 print:hidden"><p className="text-sm font-bold uppercase tracking-[.12em] text-proof">Official California form · CF 888 (5/25)</p><h2 className="mt-1 font-display text-xl font-semibold">Complete participant information</h2><p className="mt-2 text-sm text-text-muted">ShiftCred fills the verified kitchen details and hours. Review the PDF and have the organization representative sign it before submission.</p><div className="mt-4 grid gap-3">{([['name','Full legal name'],['birthdate','Birthdate'],['address1','Street address'],['address2','City, state, ZIP']] as const).map(([key,label]) => <label key={key} className="grid gap-1 text-sm font-semibold">{label}<input value={person[key]} onChange={(e) => setPerson({ ...person, [key]: e.target.value })} type={key === 'birthdate' ? 'date' : 'text'} className="min-h-12 rounded-xl border border-border bg-bg px-3 text-base font-normal"/></label>)}</div><div className="mt-4 rounded-xl bg-pace/10 p-3 text-sm"><strong>Before submitting:</strong> confirm every field, obtain the representative’s signature, and follow your county’s instructions.</div><button onClick={download} disabled={busy || !person.name || !person.birthdate || !person.address1} className="mt-4 min-h-14 w-full rounded-2xl border-2 border-border bg-proof px-4 font-bold text-white disabled:opacity-40">{busy ? "Preparing…" : "Download filled CF 888 for review & signature"}</button></section>;
}
