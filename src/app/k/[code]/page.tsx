import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckIn } from "./CheckIn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkin");
  return { title: `HourProof: ${t("title")}` };
}

// A Server Component shell for the kitchen's QR poster link (/k/<code>). Everything that
// talks to the check-in backend happens in the browser, in CheckIn, which loads the
// backend module lazily; nothing about the volunteer is read or rendered on the server.
// Next 16: dynamic route params are a Promise.
export default async function CheckInPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [en, es] = await Promise.all([
    getTranslations({ locale: "en", namespace: "checkin" }),
    getTranslations({ locale: "es", namespace: "checkin" }),
  ]);
  return (
    <>
      <noscript>
        <div className="flex flex-col gap-2 border-b-2 border-border bg-surface px-4 py-4 text-lg text-text">
          <p lang="en">{en("noscript")}</p>
          <p lang="es">{es("noscript")}</p>
        </div>
      </noscript>
      <CheckIn code={code} />
    </>
  );
}
