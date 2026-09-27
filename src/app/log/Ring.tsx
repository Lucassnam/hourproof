// The 80-hour ring: a hand-written SVG donut (no chart library). No "use client" of its
// own: it has no hooks, and it is only rendered from HourLog (a client component).
//
// The arc is the `proof` token over a neutral `surface-2` track. The number in the middle
// is plain HTML over the SVG (sharper text than SVG <text>, and it wraps the unit line).
// The whole thing is one role="img" with a localized label; the parts inside are hidden
// from screen readers so the number isn't read twice.
//
// Motion: the arc eases to its new length in 200ms, but only when the person hasn't asked
// for reduced motion (`motion-safe:`); with reduced motion it jumps.

const SIZE = 220;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function Ring({
  counted,
  target = 80,
  countedText,
  label,
  unitText,
  doneText,
  met,
  loading = false,
}: {
  counted: number;
  target?: number;
  // `counted` already formatted for the locale (e.g. "52" or "52,5").
  countedText: string;
  // The accessible name, e.g. "52 of 80 hours this month".
  label: string;
  // "of 80 hours"
  unitText: string;
  // "Done for this month"
  doneText: string;
  met: boolean;
  loading?: boolean;
}) {
  const fraction = loading ? 0 : Math.max(0, Math.min(1, counted / target));
  const offset = CIRCUMFERENCE * (1 - fraction);
  // Long numbers ("79,8") get a slightly smaller size so they stay inside the hole.
  const numberSize = countedText.length <= 3 ? "text-6xl" : "text-5xl";

  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto shrink-0"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-surface-2" />
        {fraction > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap={fraction >= 1 ? "butt" : "round"}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="stroke-proof motion-safe:transition-[stroke-dashoffset] motion-safe:duration-200 motion-safe:ease-out"
          />
        )}
      </svg>
      {!loading && (
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {met && (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="stroke-proof" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
          <span className={`font-display font-bold leading-none text-text tabular-nums ${numberSize}`}>{countedText}</span>
          <span className={"mt-1 text-lg leading-tight " + (met ? "font-semibold text-proof" : "text-text-muted")}>
            {met ? doneText : unitText}
          </span>
        </div>
      )}
    </div>
  );
}
