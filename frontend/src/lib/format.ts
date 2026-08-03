import { format, isAfter, parseISO, startOfDay } from 'date-fns'

/** 'Sat, 20 Sep 2026' — for lists and cards. */
export function formatDate(iso: string): string {
  return format(parseISO(iso), 'EEE, d MMM yyyy')
}

/** '20 September 2026' — for page headings and detail views. */
export function formatDateLong(iso: string): string {
  return format(parseISO(iso), 'd MMMM yyyy')
}

/** { day: '20', month: 'Sep' } — for the date chip on event cards. */
export function formatDateChip(iso: string): { day: string; month: string; year: string } {
  const date = parseISO(iso)
  return {
    day: format(date, 'd'),
    month: format(date, 'MMM'),
    year: format(date, 'yyyy'),
  }
}

/** Today counts as upcoming — an event this evening has not passed. */
export function isUpcoming(iso: string, now: Date = new Date()): boolean {
  return isAfter(startOfDay(parseISO(iso)), startOfDay(now)) || isSameDay(iso, now)
}

function isSameDay(iso: string, now: Date): boolean {
  return startOfDay(parseISO(iso)).getTime() === startOfDay(now).getTime()
}

/**
 * Indian rupee formatting with lakh/crore digit grouping — ₹1,20,000, not
 * ₹120,000. Whole rupees only; club fees are not quoted in paise.
 */
export function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Up to two initials from a name, for monogram placeholders. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))

  const first = words.at(0)?.charAt(0) ?? '?'
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? '') : ''
  return (first + last).toUpperCase()
}
