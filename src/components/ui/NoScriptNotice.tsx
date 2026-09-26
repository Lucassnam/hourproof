import { getTranslations } from "next-intl/server";
import type { County } from "@/lib/rules/schema";
import { telHref } from "@/lib/tel";

// Shown only when JavaScript is off. Always bilingual, since the reader may not be able to
// switch languages without JavaScript, and it always gives a way to reach a person.
export async function NoScriptNotice({ county }: { county: County }) {
  const [en, es] = await Promise.all([
    getTranslations({ locale: "en", namespace: "noscript" }),
    getTranslations({ locale: "es", namespace: "noscript" }),
  ]);
  const phone = (
    <a href={telHref(county.phone)} className="whitespace-nowrap font-semibold underline">
      {county.phone}
    </a>
  );

  return (
    <noscript>
      <div className="flex flex-col gap-2 border-b-2 border-border bg-surface px-4 py-4 text-lg text-text">
        <p lang="en">
          {en("message")} {county.name}, {phone}
        </p>
        <p lang="es">
          {es("message")} {county.name}, {phone}
        </p>
      </div>
    </noscript>
  );
}
