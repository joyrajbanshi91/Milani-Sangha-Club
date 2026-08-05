import { randomInt } from 'node:crypto'

/**
 * The code that proves a receipt is the club's.
 *
 * ## Why a reference number is not enough
 *
 * Every document this system issues carries a **sequential** number —
 * `REF-2026-000012`, `RCT-2026-000004`. That is deliberate and must stay: gapless
 * numbering is what makes a set of books auditable, because a missing number is a
 * question somebody has to answer.
 *
 * It is also, by construction, **guessable**. Anybody holding one genuine receipt
 * knows roughly where the club's counter is, and can put a plausible number on a
 * document the club never issued — for a payment never made, or for a larger amount
 * than was handed over. The club spotted this, and they are right: the sequence
 * orders the books, it does not authenticate them.
 *
 * So each declaration also gets a code that cannot be guessed, printed on the
 * receipt beside the number. A forged receipt can carry a plausible `RCT-` number;
 * it cannot carry a code that is in the club's records.
 *
 * ## The alphabet, and why it is short of letters
 *
 * Crockford's base32: digits and capitals, with **I, L, O and U removed**. The first
 * three because a code gets read down a phone and written on a paper counterfoil,
 * where `I`/`1` and `O`/`0` are the same character to a tired reader; `U` because
 * removing it keeps the alphabet from spelling anything unfortunate by accident.
 *
 * Ten characters from 28 symbols is about 3 x 10^14 codes. A club issuing a thousand
 * receipts a year would need to keep going for longer than the universe has existed
 * before a guess became a reasonable bet, and `PaymentService` checks the store for a
 * collision anyway rather than trusting arithmetic.
 */
export const SECURITY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.replace(/[ILOU]/g, '')

export const SECURITY_CODE_LENGTH = 10

/**
 * A fresh code, from the operating system's random source.
 *
 * `randomInt` rather than `Math.random()`: this is the value standing between the
 * club's books and a forged receipt, and `Math.random()` is a predictable sequence
 * seeded by the process. `randomInt` also samples without modulo bias, so no
 * character is quietly more likely than another.
 */
export function newSecurityCode(): string {
  let code = ''
  for (let index = 0; index < SECURITY_CODE_LENGTH; index += 1) {
    code += SECURITY_CODE_ALPHABET[randomInt(SECURITY_CODE_ALPHABET.length)]
  }
  return code
}

/**
 * Grouped for reading aloud: `4K7P-2WQ9-XB`.
 *
 * Only for display. What is stored and compared is always the ungrouped code, so a
 * member reading the hyphens back over the telephone cannot fail a lookup.
 */
export function formatSecurityCode(code: string): string {
  return code.replace(/(.{4})(.{4})(.*)/, '$1-$2-$3').replace(/-+$/, '')
}

/**
 * Read a code the way somebody typed it.
 *
 * Hyphens and spaces dropped, lower case raised, and the four ambiguous characters
 * folded onto what the person meant: a hand-written `O` is `0`, `I` and `l` are `1`.
 * Without this, a code copied off a paper receipt fails a lookup that should have
 * succeeded, and an officer concludes the receipt is forged when it is genuine.
 */
export function normaliseSecurityCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
}

export function isSecurityCode(value: string): boolean {
  return (
    value.length === SECURITY_CODE_LENGTH &&
    [...value].every((character) => SECURITY_CODE_ALPHABET.includes(character))
  )
}
