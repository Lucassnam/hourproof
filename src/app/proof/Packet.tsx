"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { deliverFile, ShareStep, type PendingFile } from "@/components/ui/ShareStep";
import { summarizeMonth } from "@/lib/hours/summarize";
import type { Entry } from "@/lib/hours/types";
import type { ProofFile } from "@/lib/proof/files";

// "Make my proof packet": one PDF with the month's hours and its proof files, built on this
// phone (src/lib/proof/packet.ts, loaded on demand with pdf-lib). Nothing is sent anywhere.

type Props = { month: string; monthName: string; entries: Entry[]; files: ProofFile[]; today: string };
type Result = { attached: number; missing: number };

export function Packet({ month, monthName, entries, files, today }: Props) {
  const t = useTranslations("proof.packet");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<{ file: PendingFile; result: Result } | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const make = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setDone(null);
    setPending(null);
    try {
      const { buildPacket, packetFileName } = await import("@/lib/proof/packet");
      const summary = summarizeMonth(entries, month, today);
      const built = await buildPacket({ month, summary, entries, files, madeOn: today });
      const result = { attached: built.files.filter((f) => f.attached).length, missing: built.files.filter((f) => !f.attached).length };
      const blob = new Blob([built.bytes as BlobPart], { type: "application/pdf" });
      // On iPhone and iPad this waits for its own tap (the share sheet); elsewhere it downloads.
      const waiting = await deliverFile(blob, packetFileName(month));
      if (waiting) setPending({ file: waiting, result });
      else setDone(result);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="packet-heading" className="flex flex-col gap-3 rounded-2xl border-2 border-signal bg-surface p-4" data-testid="packet">
      <h2 id="packet-heading" className="font-display text-xl font-semibold">
        {t("heading")}
      </h2>
      <p className="text-lg leading-snug">{t("why")}</p>
      <button type="button" onClick={() => void make()} disabled={busy} className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}>
        {busy ? t("making") : t("make", { month: monthName })}
      </button>
      {pending && (
        <ShareStep
          pending={pending.file}
          onDone={(r) => {
            if (r === "cancelled") return;
            setDone(pending.result);
            setPending(null);
          }}
        />
      )}
      {done && (
        <p role="status" className="text-lg leading-snug font-semibold text-proof" data-testid="packet-status">
          {t("made", { n: done.attached })} {done.missing > 0 && t("missing", { n: done.missing })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {t("error")}
        </p>
      )}
    </section>
  );
}
