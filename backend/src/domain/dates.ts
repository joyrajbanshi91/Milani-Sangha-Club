/**
 * Date handling for accounting dates.
 *
 * Accounting dates are plain 'YYYY-MM-DD' strings — a cash book entry belongs to
 * a day, not to an instant, and storing a timestamp would drag time zones into
 * every comparison. ISO dates also sort correctly as strings, so range queries
 * need no conversion.
 */

/**
 * Strict ISO date check.
 *
 * `Date.parse('2026-02-31')` succeeds and silently becomes 3 March, so the
 * round-trip through toISOString is what actually rejects an impossible day.
 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Strict 'YYYY-MM' check, for month pickers. */
export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Today in the club's own time zone, so "today" is not yesterday after 5.30am. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
