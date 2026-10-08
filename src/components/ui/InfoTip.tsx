import type { ReactNode } from "react";

// A compact, tap-friendly disclosure for secondary explanations. The visible circle stays
// small while the summary keeps a 40px hit area. Native <details> means it works without
// custom state, with a keyboard, and with JavaScript disabled.
export function InfoTip({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <details className="group relative z-10 shrink-0 print:hidden" data-testid={testId}>
      <summary
        role="button"
        aria-label={label}
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full border-2 border-border bg-surface font-display text-sm font-bold leading-none text-text-muted group-open:border-signal group-open:text-signal"
        >
          i
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border-2 border-border bg-surface p-4 text-base leading-snug text-text shadow-xl">
        {children}
      </div>
    </details>
  );
}
