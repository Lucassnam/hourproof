import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="flex items-center justify-end px-4 py-3">
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10">
        {children}
      </main>
    </div>
  );
}
