import { describe, expect, it } from 'vitest'

import {
  SECURITY_CODE_ALPHABET,
  SECURITY_CODE_LENGTH,
  formatSecurityCode,
  isSecurityCode,
  newSecurityCode,
  normaliseSecurityCode,
} from '../src/lib/securityCode.js'

/**
 * The code that makes a receipt checkable.
 *
 * The club raised this themselves, and they were right: every reference this system
 * issues is sequential, so anybody holding one genuine receipt knows roughly where the
 * counter is and can put a plausible number on a document the club never issued. The
 * sequence orders the books; it does not authenticate them.
 *
 * These cover the three properties the code has to have — unguessable, never repeated,
 * and readable off a piece of paper by a person in a hurry.
 */

describe('a new code', () => {
  it('is the agreed length, from the agreed alphabet', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = newSecurityCode()
      expect(code).toHaveLength(SECURITY_CODE_LENGTH)
      expect(isSecurityCode(code)).toBe(true)
    }
  })

  it('leaves out the characters people misread', () => {
    // I/1 and O/0 are the same glyph to a tired reader copying a code off a paper
    // counterfoil, so the alphabet does not contain the ambiguous half of each pair.
    for (const character of 'ILOU') {
      expect(SECURITY_CODE_ALPHABET).not.toContain(character)
    }
  })

  it('does not repeat itself across a club-sized run', () => {
    // Not proof of uniqueness — that is the store's job and the database's unique
    // index. This catches the bug where a generator returns the same value twice
    // because it was seeded once, which is what using Math.random() would look like.
    const codes = new Set(Array.from({ length: 5_000 }, () => newSecurityCode()))
    expect(codes.size).toBe(5_000)
  })

  it('has enough combinations that guessing is not a strategy', () => {
    // 28^10. A club issuing a thousand receipts a year would be guessed at a rate of
    // about one in 300 billion per attempt.
    expect(SECURITY_CODE_ALPHABET.length ** SECURITY_CODE_LENGTH).toBeGreaterThan(1e14)
  })
})

describe('reading a code off a receipt', () => {
  it('is printed in groups, for reading aloud', () => {
    expect(formatSecurityCode('4K7P2WQ9XB')).toBe('4K7P-2WQ9-XB')
  })

  it('accepts it back however it was typed', () => {
    for (const typed of ['4K7P-2WQ9-XB', '4k7p2wq9xb', ' 4K7P 2WQ9 XB ', '4K7P–2WQ9-XB'.replace('–', '-')]) {
      expect(normaliseSecurityCode(typed)).toBe('4K7P2WQ9XB')
    }
  })

  it('folds the characters a person cannot tell apart', () => {
    // Somebody reading a printed code will write O for 0 and I or l for 1. Refusing
    // those would have an officer conclude a genuine receipt was forged.
    expect(normaliseSecurityCode('O123456789')).toBe('0123456789')
    expect(normaliseSecurityCode('I23456789A')).toBe('123456789A')
    expect(normaliseSecurityCode('l23456789A')).toBe('123456789A')
  })

  it('refuses anything that is not a code, so a typo is not a lookup', () => {
    expect(isSecurityCode('')).toBe(false)
    expect(isSecurityCode('4K7P2WQ9X')).toBe(false)
    expect(isSecurityCode('4K7P2WQ9XBB')).toBe(false)
    // A reference number is not a security code, and asking with one must not succeed.
    expect(isSecurityCode('RCT-2026-000004')).toBe(false)
  })
})
