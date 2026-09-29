// The round previous/next month button shared by /log and /proof.
export function MonthButton({
  label,
  direction,
  disabled = false,
  onClick,
}: {
  label: string;
  direction: "prev" | "next";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 min-w-12 items-center justify-center rounded-full border-2 border-border bg-surface-2 text-text disabled:border-dashed disabled:bg-transparent disabled:text-text-muted disabled:opacity-60"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {direction === "prev" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}
