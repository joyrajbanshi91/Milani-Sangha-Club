/**
 * Display formatting for amounts held as integer paise.
 *
 * The integer and fractional parts are formatted separately so that dividing by
 * 100 never introduces a rounding error, and grouping follows the Indian
 * convention — ₹1,20,000.00, not ₹120,000.00.
 *
 * Mirrors formatPaise in backend/src/domain/money.ts.
 */
export function formatPaise(paise: number, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options
  const negative = paise < 0
  const absolute = Math.abs(Math.trunc(paise))

  const rupees = Math.trunc(absolute / 100)
  const remainder = absolute % 100

  const grouped = new Intl.NumberFormat('en-IN').format(rupees)
  return `${negative ? '−' : ''}${withSymbol ? '₹' : ''}${grouped}.${String(remainder).padStart(2, '0')}`
}

/** Whole rupees, for chart axes and tight spaces where paise add noise. */
export function formatRupeesShort(paise: number): string {
  const rupees = Math.round(paise / 100)
  if (Math.abs(rupees) >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} cr`
  if (Math.abs(rupees) >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`
  if (Math.abs(rupees) >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`
  return `₹${rupees}`
}

export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })
}
