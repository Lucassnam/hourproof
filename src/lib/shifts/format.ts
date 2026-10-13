// Display helpers for shift times and hours, shared by the volunteer check-in page and the
// kitchen dashboard. Always California time (the kitchen's clock), in the page locale.

const CALIFORNIA = 'America/Los_Angeles'

// "10:02 AM" / "10:02". Any space inside the time becomes a no-break space, so "10:02" and
// "AM" never land on different lines.
export function formatClock(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: CALIFORNIA })
    .format(new Date(iso))
    .replace(/\s/g, ' ')
}

// "14:05": the value an <input type="time"> takes, in California time.
export function clockValue(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CALIFORNIA,
  }).formatToParts(new Date(iso))
  const part = (type: 'hour' | 'minute') => parts.find((p) => p.type === type)?.value ?? '00'
  return `${part('hour').padStart(2, '0')}:${part('minute').padStart(2, '0')}`
}

// Shift hours are whole quarter hours, so two decimals show them exactly ("2.75", "2,25").
// The log's one-decimal format would print 2.75 as "2.8", which overclaims.
export function formatShiftHours(locale: string, hours: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hours)
}
