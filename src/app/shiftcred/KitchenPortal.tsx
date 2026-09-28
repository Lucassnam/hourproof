"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { KitchenProfile } from "@/lib/shiftcred/types";

const PROFILE_KEY = "hp.shiftcred.kitchen.demo.v1";
const defaultProfile: KitchenProfile = { name: "", representative: "", email: "", phone: "", address: "" };

export function KitchenPortal({ onExit }: { onExit: () => void }) {
  const [profile, setProfile] = useState<KitchenProfile>(defaultProfile);
  const [signedIn, setSignedIn] = useState(false);
  const [setup, setSetup] = useState(false);
  const [created, setCreated] = useState(false);
  const [qr, setQr] = useState("");

  useEffect(() => {
    try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) { setProfile(JSON.parse(raw)); setSignedIn(true); } } catch {}
  }, []);
  useEffect(() => {
    if (!created) return;
    QRCode.toDataURL(`shiftcred:demo:${Date.now()}:sample-kitchen`, { width: 360, margin: 2, color: { dark: "#0e1116", light: "#ffffff" } }).then(setQr);
  }, [created]);

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
    setSignedIn(true); setSetup(false);
  }

  if (!signedIn || setup) return <section className="flex w-full flex-col gap-4">
    <button onClick={onExit} className="min-h-12 self-start font-semibold text-text-muted underline">← Volunteer view</button>
    <div><p className="text-sm font-bold uppercase tracking-[.12em] text-signal">Kitchen portal · Demo</p><h1 className="mt-2 font-display text-2xl font-semibold">Add your kitchen</h1><p className="mt-2 text-text-muted">Create a profile once. ShiftCred reuses it for shifts, QR codes, and CF 888 forms.</p></div>
    <div className="grid gap-3 rounded-2xl border border-border/40 bg-surface p-4">
      {([['name','Organization name'],['representative','Authorized representative'],['email','Work email'],['phone','Phone number'],['address','Street address, city, ZIP']] as const).map(([key,label]) => <label key={key} className="grid gap-1 font-semibold">{label}<input value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} type={key === 'email' ? 'email' : 'text'} className="min-h-12 rounded-xl border border-border bg-bg px-3 font-normal"/></label>)}
    </div>
    <div className="rounded-xl bg-pace/10 p-3 text-sm"><strong>Demo:</strong> this profile is saved only on this device. Production sign-in will use a one-time email or text code.</div>
    <button onClick={saveProfile} disabled={!profile.name || !profile.representative || !profile.email} className="min-h-14 rounded-2xl border-2 border-border bg-signal px-5 font-bold text-white disabled:opacity-40">Continue to dashboard</button>
  </section>;

  return <section className="flex flex-col gap-5">
    <div className="flex items-center justify-between gap-3"><button onClick={onExit} className="min-h-12 font-semibold text-text-muted underline">← Volunteer view</button><button onClick={() => setSetup(true)} className="min-h-12 font-semibold text-text-muted underline">Edit kitchen</button></div>
    <div><p className="text-sm font-bold uppercase tracking-[.12em] text-signal">Kitchen dashboard · Demo</p><h1 className="mt-2 font-display text-2xl font-semibold">{profile.name}</h1><p className="mt-1 text-text-muted">Welcome, {profile.representative}</p></div>
    <div className="grid grid-cols-3 gap-3"><Stat value="92%" label="Show-up rate"/><Stat value="18" label="Volunteers"/><Stat value="64" label="Hours verified"/></div>
    {!created ? <div className="rounded-2xl border border-border/40 bg-surface p-4"><h2 className="font-display text-xl font-semibold">Create a volunteer shift</h2><p className="mt-1 text-sm text-text-muted">Add the essentials. The roster and QR code are created automatically.</p><div className="mt-4 grid gap-3"><Field label="Role" value="Meal service"/><div className="grid grid-cols-2 gap-2"><Field label="Date" value="Oct 17, 2026"/><Field label="Time" value="8:00 AM–12:00 PM"/></div><div className="grid grid-cols-2 gap-2"><Field label="Spots" value="8"/><Field label="Languages" value="English, Spanish"/></div><Field label="Transit note" value="4 min from bus 22"/></div><button onClick={() => setCreated(true)} className="mt-4 min-h-14 w-full rounded-2xl border-2 border-border bg-signal px-5 font-bold text-white">Publish shift & create QR</button></div> : <>
      <div className="rounded-3xl bg-surface p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-bold text-proof">Published</p><h2 className="font-display text-2xl font-bold">Meal service</h2><p className="text-text-muted">Sat, Oct 17 · 8:00 AM–12:00 PM</p></div><span className="rounded-full bg-proof/10 px-3 py-1 font-bold text-proof">3 / 8 reserved</span></div></div>
      <div className="grid gap-4 rounded-2xl border border-border/40 bg-surface p-4"><div>{qr && <img src={qr} alt="Generated check-in QR code" className="mx-auto aspect-square w-full max-w-48 rounded-xl"/>}</div><div><p className="text-sm font-bold uppercase tracking-[.12em] text-signal">Ready instantly</p><h2 className="mt-1 font-display text-xl font-semibold">Your check-in code</h2><p className="mt-1 text-sm text-text-muted">Print this at the volunteer desk. Supervisors approve final hours.</p><button onClick={() => window.print()} className="mt-3 min-h-12 w-full rounded-xl border-2 border-border bg-surface-2 px-4 font-bold">Print QR poster</button></div></div>
      <div className="rounded-3xl bg-surface p-5"><h2 className="font-display text-2xl font-bold">Today’s roster</h2><div className="mt-4 divide-y divide-border/30"><Roster name="Maya R." status="Ready to check in" reliability="100%"/><Roster name="Carlos D." status="Reserved" reliability="94%"/><Roster name="Jordan P." status="Reserved" reliability="New"/></div></div>
    </>}
  </section>;
}

function Stat({ value, label }: { value: string; label: string }) { return <div className="rounded-2xl bg-surface p-3 text-center"><strong className="block font-display text-2xl text-signal">{value}</strong><span className="text-xs text-text-muted">{label}</span></div>; }
function Field({ label, value }: { label: string; value: string }) { return <label className="grid gap-1 text-sm font-semibold">{label}<input defaultValue={value} className="min-h-12 min-w-0 rounded-xl border border-border bg-bg px-3 text-base font-normal"/></label>; }
function Roster({ name, status, reliability }: { name: string; status: string; reliability: string }) { return <div className="flex items-center justify-between gap-3 py-4"><div><p className="font-bold">{name}</p><p className="text-sm text-text-muted">{status}</p></div><div className="text-right"><p className="font-bold text-proof">{reliability}</p><p className="text-xs text-text-muted">reliability</p></div></div>; }
