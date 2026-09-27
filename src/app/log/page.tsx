import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HourLog } from "./HourLog";

// The tab title follows the chosen language, like the rest of the page.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("log");
  return { title: `HourProof: ${t("title")}` };
}

// A Server Component shell. Everything about the entries happens in the browser: HourLog
// reads and writes IndexedDB on this device, and neither the store nor the entries ever
// reach the server. No rules file or zod is imported here, so none of it ships on /log.
//
// HourLog reads ?add=1 / ?edit=<id> with useSearchParams, which Next wants inside a
// Suspense boundary. The note below shows only when JavaScript is off (the log can't save
// without it), in both languages since the reader may not be able to switch.
export default async function LogPage() {
  const [en, es] = await Promise.all([
    getTranslations({ locale: "en", namespace: "log" }),
    getTranslations({ locale: "es", namespace: "log" }),
  ]);
  return (
    <>
      <noscript>
        <div className="flex flex-col gap-2 border-b-2 border-border bg-surface px-4 py-4 text-lg text-text">
          <p lang="en">{en("noscript")}</p>
          <p lang="es">{es("noscript")}</p>
        </div>
      </noscript>
      <Suspense fallback={null}>
        <HourLog />
      </Suspense>
    </>
  );
}
