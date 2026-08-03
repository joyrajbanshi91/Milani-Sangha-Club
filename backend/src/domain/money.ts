/**
 * Money arithmetic.
 *
 * Every amount in this system is an INTEGER NUMBER OF PAISE. Rupees are never
 * stored or added as floating point, because 0.1 + 0.2 !== 0.3 in binary
 * floating point and a club's ledger would drift by paise that nobody can
 * account for. Conversion to rupees happens only when formatting for display.
 *
 * All amounts are non-negative. Direction comes from the transaction kind
 * (income adds, expense subtracts), never from a negative amount — which keeps
 * "an expense of minus ₹500" from ever meaning something.
 */

/** Largest amount accepted: ₹10 crore, far beyond any club, and safely integer. */
export const MAX_AMOUNT_PAISE = 100_000_000_00

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/**
 * Convert a human-entered rupee amount to paise.
 *
 * Accepts '1234', '1234.5', '1234.56', '1,23,456.78', ' ₹500 ', and numbers.
 * Rejects anything with more than two decimal places rather than rounding it:
 * silently turning ₹10.999 into ₹11.00 is how a ledger stops matching a bank
 * statement.
 */
export function rupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError('Amount is not a finite number')
    // Guard against float artefacts such as 10.005 arriving as 10.004999999.
    const paise = Math.round(input * 100)
    if (Math.abs(input * 100 - paise) > 1e-6) {
      throw new MoneyError(`Amount ${input} has more precision than paise`)
    }
    return assertValid(paise)
  }

  const cleaned = input.trim().replace(/^₹\s*/, '').replace(/,/g, '').replace(/\s/g, '')
  if (cleaned === '') throw new MoneyError('Amount is empty')

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match?.[1]) {
    throw new MoneyError(
      `"${input}" is not a valid amount. Use digits with at most two decimal places, e.g. 1500 or 1500.50`
    )
  }

  const rupees = Number(match[1])
  const paisePart = Number((match[2] ?? '0').padEnd(2, '0'))
  return assertValid(rupees * 100 + paisePart)
}

function assertValid(paise: number): number {
  if (!Number.isInteger(paise)) throw new MoneyError('Amount in paise must be a whole number')
  if (paise < 0) throw new MoneyError('Amount cannot be negative')
  if (paise > MAX_AMOUNT_PAISE) {
    throw new MoneyError(`Amount exceeds the ${formatPaise(MAX_AMOUNT_PAISE)} limit`)
  }
  return paise
}

/** Validate an amount that arrived already in paise (from the API or database). */
export function assertPaise(paise: number, field = 'amount'): number {
  try {
    return assertValid(paise)
  } catch (error) {
    throw new MoneyError(`${field}: ${error instanceof Error ? error.message : 'invalid'}`)
  }
}

/**
 * Format paise as rupees.
 *
 * Grouped in the Indian convention — ₹1,20,000.00, not ₹120,000.00 — and built
 * from the integer and fractional parts separately so no division by 100 ever
 * introduces a rounding error.
 */
export function formatPaise(paise: number, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options
  const negative = paise < 0
  const absolute = Math.abs(Math.trunc(paise))

  const rupees = Math.trunc(absolute / 100)
  const remainder = absolute % 100

  const grouped = new Intl.NumberFormat('en-IN', { useGrouping: true }).format(rupees)
  const text = `${grouped}.${String(remainder).padStart(2, '0')}`

  return `${negative ? '-' : ''}${withSymbol ? '₹' : ''}${text}`
}

/** Exact sum. Kept explicit so nobody reaches for `reduce` with floats. */
export function sumPaise(amounts: readonly number[]): number {
  let total = 0
  for (const amount of amounts) {
    if (!Number.isInteger(amount)) throw new MoneyError('Cannot sum non-integer paise')
    total += amount
  }
  return total
}
