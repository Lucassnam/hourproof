// Locale-aware formatting for the hour log. Dates here are plain California calendar
// strings ('YYYY-MM-DD' / 'YYYY-MM'), so they are formatted in UTC from a UTC midnight:
// no device time zone can shift them to the day before.

export function numberFormat(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
}

// "52", "52.5" / "52,5". 79.75 shows as "79.8" (one decimal, per the plan); since hours
// are whole quarter hours, the display can never round up to "80" before the goal is met.
export function formatNumber(locale: string, n: number): string {
  return numberFormat(locale).format(n);
}

// For the hours text box: exact (quarter hours need 2 decimals), with the locale's
// decimal mark, and no grouping ("1,000" would read as 1 in Spanish).
export function formatHoursInput(locale: string, n: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

// Accepts "2.5", "2,5", " 4 ". Anything else (letters, two marks, empty) is NaN, and the
// store's validation turns that into the bad_hours message.
export function parseHours(text: string): number {
  const cleaned = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function utcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1));
}

function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

// "September 2026" / "Septiembre de 2026"
// Capitalized for a heading; pass `{ capitalize: false }` for mid-sentence use ("en septiembre").
export function formatMonth(locale: string, month: string, { capitalize: cap = true } = {}): string {
  const text = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(utcDate(month));
  return cap ? capitalize(text, locale) : text;
}

// "Saturday, September 26" / "Sábado, 26 de septiembre"
export function formatDay(locale: string, date: string): string {
  const text = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    utcDate(date),
  );
  return capitalize(text, locale);
}

// crypto.randomUUID needs a secure context and Chrome 92+; old phones and plain-http LAN
// testing may lack it, so fall back to getRandomValues (available far longer).
export function newId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
