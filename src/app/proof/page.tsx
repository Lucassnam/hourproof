import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProofDocuments } from "./ProofDocuments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("proof");
  return { title: `HourProof: ${t("title")}` };
}

// A Server Component shell, like /log: the entries and the files are read from IndexedDB in
// the browser and never reach the server. The CF 888 is filled on the phone too (see
// @/lib/proof/cf888), so there is no API route for it.
export default async function ProofPage() {
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
      <ProofDocuments />
    </>
  );
}
