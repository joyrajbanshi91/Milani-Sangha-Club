import type { Actor, Category, Fund, Transaction } from '../../src/domain/types.js'

/** Test fixtures. Kept in one place so every finance test uses the same shapes. */

export const CASH: Fund = {
  id: 'fund-cash',
  name: 'Cash box',
  kind: 'cash',
  openingBalancePaise: 500_000, // ₹5,000
  openingDate: '2026-04-01',
  active: true,
}

export const BANK: Fund = {
  id: 'fund-bank',
  name: 'Bank account',
  kind: 'bank',
  openingBalancePaise: 2_000_000, // ₹20,000
  openingDate: '2026-04-01',
  active: true,
}

export const FUNDS: Fund[] = [CASH, BANK]

export const FEES: Category = { id: 'cat-fees', name: 'Membership fees', kind: 'income', active: true }
export const DONATIONS: Category = { id: 'cat-don', name: 'Donations', kind: 'income', active: true }
export const GROUND: Category = {
  id: 'cat-ground',
  name: 'Ground maintenance',
  kind: 'expense',
  active: true,
}
export const EVENTS: Category = { id: 'cat-events', name: 'Events', kind: 'expense', active: true }

export const CATEGORIES: Category[] = [FEES, DONATIONS, GROUND, EVENTS]

export const TREASURER: Actor = { uid: 'u-treasurer', name: 'Treasurer', role: 'treasurer' }
export const SECRETARY: Actor = { uid: 'u-secretary', name: 'Secretary', role: 'secretary' }
export const PRESIDENT: Actor = { uid: 'u-president', name: 'President', role: 'president' }
export const MEMBER: Actor = { uid: 'u-member', name: 'Ordinary Member', role: 'member' }
export const VOLUNTEER: Actor = { uid: 'u-volunteer', name: 'Volunteer', role: 'volunteer' }

let counter = 0

/** A transaction with sensible defaults; override whatever the test cares about. */
export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `txn-${counter}`,
    reference: `TXN-2026-${String(counter).padStart(6, '0')}`,
    kind: 'income',
    status: 'posted',
    date: '2026-04-15',
    amountPaise: 100_000,
    fundId: CASH.id,
    categoryId: FEES.id,
    source: 'Member dues',
    description: 'Annual subscription',
    createdBy: TREASURER.uid,
    createdByName: TREASURER.name,
    createdAt: '2026-04-15T10:00:00.000Z',
    approvals: [
      { uid: SECRETARY.uid, name: SECRETARY.name, role: 'secretary', at: '2026-04-15T11:00:00.000Z' },
    ],
    postedAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

/** A pending entry: recorded, not yet approved by anyone. */
export function makePending(overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({ status: 'pending', approvals: [], ...overrides, postedAt: undefined })
}
