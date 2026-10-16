"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { prefersShareSheet, saveFile, type SaveResult } from "@/lib/storage/save-file";

// A file the app just made, waiting for its own tap on iPhone and iPad, where Safari opens
// the share sheet only straight from a tap (see src/lib/storage/save-file.ts).
export type PendingFile = { blob: Blob; name: string };

// Saves the file now if this device downloads, or returns it to be shown in a ShareStep.
export async function deliverFile(blob: Blob, name: string): Promise<PendingFile | null> {
  if (prefersShareSheet()) return { blob, name };
  await saveFile(blob, name);
  return null;
}

export function ShareStep({ pending, onDone }: { pending: PendingFile; onDone: (result: SaveResult) => void }) {
  const t = useTranslations("common.share");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-proof bg-surface p-3" data-testid="share-step">
      <p className="text-lg leading-snug font-semibold break-words">{t("ready", { name: pending.name })}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onDone(await saveFile(pending.blob, pending.name));
          } finally {
            setBusy(false);
          }
        }}
        className={buttonClasses({ variant: "strong", size: "lg", fullWidth: true })}
      >
        {t("button")}
      </button>
    </div>
  );
}
