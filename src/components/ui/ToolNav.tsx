"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

type Tool = "hours" | "proof" | "shiftcred";

const LABELS = {
  en: { hours: "Hours", proof: "Documents", shiftcred: "Volunteer" },
  es: { hours: "Horas", proof: "Documentos", shiftcred: "Turnos" },
} as const;

const ITEMS: Array<{ key: Tool; href: string }> = [
  { key: "hours", href: "/hours" },
  { key: "proof", href: "/proof" },
  { key: "shiftcred", href: "/shiftcred" },
];

export function ToolNav({ current }: { current: Tool }) {
  const locale = useLocale() === "es" ? "es" : "en";

  return <div className="sticky top-0 z-20 -mx-1 bg-bg px-1 py-2 print:hidden">
    <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 text-sm font-semibold" aria-label="HourProof tools">
      {ITEMS.map((item) => <Link key={item.key} href={item.href} aria-current={current === item.key ? "page" : undefined} className={`flex min-h-12 items-center justify-center rounded-xl px-2 text-center ${current === item.key ? "bg-surface text-text shadow-sm" : "text-text-muted"}`}>{LABELS[locale][item.key]}</Link>)}
    </nav>
  </div>;
}
