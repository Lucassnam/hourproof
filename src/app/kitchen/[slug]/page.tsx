import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Dashboard } from "./Dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("kitchen");
  // A supervisor tool behind a PIN: nothing here is for search engines.
  return { title: `HourProof: ${t("title")}`, robots: { index: false, follow: false } };
}

// A Server Component shell for the supervisor's dashboard (/kitchen/<slug>). Everything that
// needs the PIN happens in the browser, in Dashboard, which loads the backend lazily and
// keeps the PIN in memory only. Next 16: dynamic route params are a Promise.
export default async function KitchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [en, es] = await Promise.all([
    getTranslations({ locale: "en", namespace: "kitchen" }),
    getTranslations({ locale: "es", namespace: "kitchen" }),
  ]);
  return (
    <>
      <noscript>
        <div className="flex flex-col gap-2 border-b-2 border-border bg-surface px-4 py-4 text-lg text-text">
          <p lang="en">{en("noscript")}</p>
          <p lang="es">{es("noscript")}</p>
        </div>
      </noscript>
      <Dashboard slug={slug} />
    </>
  );
}
