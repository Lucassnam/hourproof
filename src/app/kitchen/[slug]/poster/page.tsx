import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Poster, type PrintedText } from "./Poster";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("kitchen.poster");
  return { title: `HourProof: ${t("title")}`, robots: { index: false, follow: false } };
}

// The kitchen's printable QR poster. The page asks for the PIN again; Poster sends it to a
// server action (./actions.ts), which gets the code from the backend and draws the QR on the
// server. The printed instructions are always in English and Spanish, whatever language the
// supervisor's screen is in, so they're read here for both locales.
export default async function PosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [en, es] = await Promise.all([
    getTranslations({ locale: "en", namespace: "kitchen" }),
    getTranslations({ locale: "es", namespace: "kitchen" }),
  ]);
  const printed = (t: typeof en): PrintedText => ({
    title: t("poster.printTitle"),
    steps: [t("poster.step1"), t("poster.step2"), t("poster.step3")],
    typeAddress: t("poster.typeAddress"),
  });
  return (
    <>
      <noscript>
        <div className="flex flex-col gap-2 border-b-2 border-border bg-surface px-4 py-4 text-lg text-text">
          <p lang="en">{en("noscript")}</p>
          <p lang="es">{es("noscript")}</p>
        </div>
      </noscript>
      <Poster slug={slug} printed={{ en: printed(en), es: printed(es) }} />
    </>
  );
}
