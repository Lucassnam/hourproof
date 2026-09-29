"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Screen } from "@/components/ui/Screen";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { MonthButton } from "@/components/ui/MonthButton";
import { addMonths, californiaDate, monthOf } from "@/lib/dates";
import { getMode, openStore } from "@/lib/hours/store";
import type { ActivityType, Entry } from "@/lib/hours/types";
import { ProofFileError, openProofStore, type ProofFile, type ProofStore } from "@/lib/proof/files";
import { proofGroups, volunteerPlaces } from "@/lib/proof/groups";
import { formatMonth, formatNumber } from "@/app/log/format";
import { Cf888Form } from "./Cf888Form";

// /proof: one box per activity type logged in the month, each holding the person's photos
// and PDFs, plus a CF 888 per volunteer organization. Everything stays in IndexedDB on this
// device (the hour log's database for entries, a separate one for files).

type Loaded = { entries: Entry[]; files: ProofStore };

const BLANK_CF888 = "https://cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/A-D/CF888.pdf";

export function ProofDocuments() {
  const t = useTranslations("proof");
  const tl = useTranslations("log");
  const locale = useLocale();
  const [currentMonth] = useState(() => monthOf(californiaDate()));
  const [month, setMonth] = useState(currentMonth);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [files, setFiles] = useState<ProofFile[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = getMode();
        const [store, proof] = await Promise.all([openStore(mode), openProofStore(mode)]);
        const entries = await store.list();
        if (!cancelled) setLoaded({ entries, files: proof });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    loaded.files.list(month).then(
      (list) => !cancelled && setFiles(list),
      () => !cancelled && setLoadFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [loaded, month]);

  const monthEntries = useMemo(
    () => (loaded ? loaded.entries.filter((e) => monthOf(e.date) === month) : []),
    [loaded, month],
  );
  const groups = useMemo(() => proofGroups(monthEntries), [monthEntries]);
  const places = useMemo(() => volunteerPlaces(monthEntries), [monthEntries]);
  const monthName = formatMonth(locale, month);
  const hoursText = (n: number) => tl("hoursN", { n: formatNumber(locale, n), count: n });

  const addFiles = async (type: ActivityType, list: FileList | null) => {
    if (!loaded || !list) return;
    setStatus("");
    setError("");
    const added: string[] = [];
    for (const file of Array.from(list)) {
      try {
        await loaded.files.add(file, month, type);
        added.push(file.name);
      } catch (e) {
        setError(t(`errors.${e instanceof ProofFileError ? e.code : "save"}`, { name: file.name }));
      }
    }
    setFiles(await loaded.files.list(month));
    if (added.length) setStatus(t("added", { name: added.join(", ") }));
  };

  const removeFile = async (file: ProofFile) => {
    if (!loaded) return;
    setError("");
    await loaded.files.remove(file.id);
    setFiles(await loaded.files.list(month));
    setStatus(t("removed", { name: file.name }));
  };

  const changeMonth = (next: string) => {
    setStatus("");
    setError("");
    setFiles([]);
    setMonth(next);
  };

  return (
    <Screen banner={<DemoBanner />}>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="-mt-2 text-lg leading-snug text-text-muted">{t("intro")}</p>

      <nav aria-label={monthName} className="flex flex-wrap items-center justify-between gap-2">
        <MonthButton label={t("prevMonth")} direction="prev" onClick={() => changeMonth(addMonths(month, -1))} />
        <p aria-live="polite" className="min-w-0 flex-1 text-center font-display text-xl font-semibold max-[260px]:order-first max-[260px]:basis-full">
          {monthName}
        </p>
        <MonthButton
          label={t("nextMonth")}
          direction="next"
          disabled={month >= currentMonth}
          onClick={() => month < currentMonth && changeMonth(addMonths(month, 1))}
        />
      </nav>

      <p role="status" className="text-center text-lg font-semibold text-proof empty:hidden">
        {status}
      </p>
      <p role="alert" className="rounded-2xl border-2 border-danger bg-surface px-4 py-3 text-lg font-semibold text-danger empty:hidden">
        {loadFailed ? t("loadError") : error}
      </p>

      {!loaded && !loadFailed && <p className="text-lg text-text-muted">{t("loading")}</p>}

      {loaded && groups.length === 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4" data-testid="empty">
          <p className="text-lg font-semibold">{t("empty", { month: formatMonth(locale, month, { capitalize: false }) })}</p>
          <a href="/log" className="flex min-h-12 items-center self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4">
            {t("emptyAction")}
          </a>
        </div>
      )}

      {loaded &&
        groups.map(({ type, hours }) => {
          const typeLabel = tl(`types.${type}.label`);
          const typeFiles = files.filter((f) => f.type === type);
          const inputId = `proof-add-${type}`;
          return (
            <section
              key={type}
              aria-labelledby={`proof-${type}`}
              data-testid={`proof-${type}`}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4"
            >
              <div>
                <h2 id={`proof-${type}`} className="font-display text-xl font-semibold">
                  {typeLabel}
                </h2>
                <p className="text-lg tabular-nums text-text-muted">{t("logged", { hours: hoursText(hours) })}</p>
              </div>

              {type === "volunteer" && (
                <div className="flex flex-col gap-3">
                  <p className="text-lg leading-snug">{t("cf888.why")}</p>
                  {places.map((p) => (
                    <Cf888Form key={p.place || "-"} place={p.place} hours={p.hours} month={month} />
                  ))}
                  <a href={BLANK_CF888} target="_blank" rel="noopener" className="flex min-h-12 items-center self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4">
                    {t("cf888.blank")}
                  </a>
                </div>
              )}

              {typeFiles.length === 0 ? (
                <p className="text-lg text-text-muted">{t("noFiles")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {typeFiles.map((file) => (
                    <li key={file.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl bg-surface-2 py-2 pr-2 pl-4">
                      <span className="truncate text-lg" title={file.name}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => openFile(file)}
                        aria-label={t("openLabel", { name: file.name })}
                        className="min-h-12 rounded-2xl border-2 border-border bg-surface px-3 text-lg font-semibold"
                      >
                        {t("open")}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(file)}
                        aria-label={t("removeLabel", { name: file.name })}
                        className="min-h-12 rounded-2xl border-2 border-border bg-surface px-3 text-lg font-semibold"
                      >
                        {t("remove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* The label is the visible button; the input stays in the accessibility tree
                  (sr-only, not display:none) so keyboards and screen readers can reach it. */}
              <label
                htmlFor={inputId}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-border bg-surface-2 px-6 text-lg font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal"
              >
                {t("add")}
                <input
                  id={inputId}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  aria-label={t("addLabel", { type: typeLabel })}
                  className="sr-only"
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    await addFiles(type, input.files);
                    input.value = "";
                  }}
                />
              </label>
            </section>
          );
        })}

      {loaded && groups.length > 0 && <p className="text-lg leading-snug text-text-muted">{t("anyProof")}</p>}

      <footer className="mt-2 flex flex-col gap-3 border-t-2 border-border pt-4">
        <p className="text-lg text-text-muted">{t("savedOnPhone")}</p>
        <a href="/log" className="flex min-h-12 items-center self-start text-lg font-semibold text-signal underline decoration-2 underline-offset-4">
          {t("backToLog")}
        </a>
      </footer>
    </Screen>
  );
}

// Opens the stored file in a new tab from a short-lived object URL (nothing is uploaded).
function openFile(file: ProofFile) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
