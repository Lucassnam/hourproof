import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitch } from "./LanguageSwitch";

export function Screen({
  children,
  languageSwitch = true,
  banner,
}: {
  children: ReactNode;
  // A full-width bar above the header (the demo banner).
  banner?: ReactNode;
  // The home page has its own large language buttons, so it hides the compact one.
  languageSwitch?: boolean;
}) {
  const t = useTranslations("site.footer");
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      {banner}
      <header className="flex items-center justify-end gap-3 px-4 py-3">
        {languageSwitch && <LanguageSwitch />}
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10">
        {children}
      </main>
      {/* On every screen, including kitchen check-in (the one place that sends anything):
          who made this and what happens to your information. Plain links, not printed. */}
      <footer className="mx-auto w-full max-w-md px-4 pb-6 print:hidden">
        <nav aria-label={t("label")} className="flex flex-wrap gap-x-6 border-t-2 border-border pt-2">
          <a href="/about" className="flex min-h-12 items-center text-lg text-text-muted underline underline-offset-4">
            {t("about")}
          </a>
          <a href="/privacy" className="flex min-h-12 items-center text-lg text-text-muted underline underline-offset-4">
            {t("privacy")}
          </a>
        </nav>
      </footer>
    </div>
  );
}
