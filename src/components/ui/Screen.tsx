import type { ReactNode } from "react";
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
    </div>
  );
}
