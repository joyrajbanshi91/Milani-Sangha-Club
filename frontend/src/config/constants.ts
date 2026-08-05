/**
 * Domain constants for the web app.
 *
 * The marked region below is shared verbatim with
 * `backend/src/config/constants.ts`. The two apps are separate npm packages
 * with different module systems, so the values are duplicated rather than
 * imported; `scripts/check_domain_constants.py` fails CI if they drift apart.
 * A member number format that disagrees between client and server is the kind
 * of bug that only surfaces after real receipts have been issued.
 */

// #region shared-domain
// --- Roles (SRS §3) --------------------------------------------------------

export const ROLES = [
  'visitor',
  'member',
  'volunteer',
  'secretary',
  'treasurer',
  'president',
  'administrator',
] as const

export type Role = (typeof ROLES)[number]

/**
 * Ascending privilege. Used for "at least this role" checks; it does not
 * replace explicit permission checks for sensitive actions such as payment
 * verification, which belongs to the treasurer regardless of rank.
 */
export const ROLE_RANK: Record<Role, number> = {
  visitor: 0,
  member: 1,
  volunteer: 2,
  secretary: 3,
  treasurer: 4,
  president: 5,
  administrator: 6,
}

export const STAFF_ROLES: readonly Role[] = [
  'volunteer',
  'secretary',
  'treasurer',
  'president',
  'administrator',
]

// --- Membership (SRS §7) ---------------------------------------------------

export const MEMBERSHIP_TYPES = [
  'student',
  'regular',
  'family',
  'senior',
  'life',
  'corporate',
  'honorary',
  'associate',
] as const

export type MembershipType = (typeof MEMBERSHIP_TYPES)[number]

export const MEMBERSHIP_STATUSES = ['pending', 'active', 'expired', 'suspended'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

// --- Payments and receipts (SRS §8, §9) ------------------------------------

/**
 * Lifecycle of a member's payment declaration (a "fund request").
 *
 *   pending_verification  the member says they have paid; nobody has checked
 *   approved              an officer confirmed the money arrived, recorded it in the
 *                         ledger and issued the receipt. That ledger entry still
 *                         needs one other officer's approval before it counts
 *                         towards a balance
 *   rejected              an officer could not find the payment
 *   withdrawn             the member took their own declaration back
 *
 * A declaration is never a receipt and never a balance: it is a member's claim.
 * 'approved' means an officer checked the claim against the club's records, which
 * is the entire reason the step exists.
 *
 * There is deliberately no 'initiated'. Nothing here can produce it without an
 * online payment gateway, and a status no code path reaches is a tab in the
 * officer's queue that never fills.
 */
export const PAYMENT_STATUSES = [
  'pending_verification',
  'approved',
  'rejected',
  'withdrawn',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** What the member says the money was for. */
export const PAYMENT_PURPOSES = ['membership', 'donation', 'event', 'other'] as const
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number]

/**
 * How the member says they paid.
 *
 * Each implies a different thing for the officer to check against, which is why
 * the form asks for a different detail per method: a UPI or cheque reference to
 * match against the statement, or the name of the officer who took the cash.
 */
export const PAYMENT_METHODS = ['upi', 'cash', 'bank'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Identifier formats. The sequence is allocated server-side, never in the client. */
export const ID_FORMATS = {
  member: { prefix: 'CLB', padding: 6 },
  receipt: { prefix: 'RCT', padding: 6 },
  paymentReference: { prefix: 'REF', padding: 6 },
} as const

// --- Help desk (SRS §14) ---------------------------------------------------

export const TICKET_TYPES = [
  'membership',
  'payment',
  'event',
  'complaint',
  'suggestion',
  'technical',
] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

// --- Notifications (SRS §16) ----------------------------------------------

/** Days before membership expiry on which a reminder is sent. */
export const RENEWAL_REMINDER_DAYS = [30, 15, 7, 1] as const

// --- Firestore collections (SRS §21) --------------------------------------

export const COLLECTIONS = {
  users: 'users',
  members: 'members',
  applications: 'applications',
  payments: 'payments',
  receipts: 'receipts',
  events: 'events',
  registrations: 'registrations',
  attendance: 'attendance',
  gallery: 'gallery',
  news: 'news',
  documents: 'documents',
  tickets: 'tickets',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  settings: 'settings',
  finance: 'finance',
  funds: 'finance_funds',
  financeCategories: 'finance_categories',
  financeTransactions: 'finance_transactions',
  financeApprovals: 'finance_approvals',
  /** One row per financial year, holding the balances it was started with. */
  financeYears: 'finance_years',
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
// --- Finance (officer area) ------------------------------------------------

/** Where the club's money physically sits. */
export const FUND_KINDS = ['cash', 'bank', 'upi', 'other'] as const
export type FundKind = (typeof FUND_KINDS)[number]

/** A category is either something the club receives or something it spends. */
export const CATEGORY_KINDS = ['income', 'expense'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const TRANSACTION_KINDS = ['income', 'expense', 'transfer'] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

/**
 * Lifecycle of a financial entry.
 *
 *   pending    recorded by one officer, awaiting a second officer's approval
 *   posted     approved; only posted entries affect any balance
 *   rejected   a second officer declined it; never affected a balance
 *   discarded  withdrawn by its author before anyone approved it
 *   reversed   was posted, then cancelled by an approved reversal entry
 *
 * A posted entry is never edited or deleted. Cancelling one posts an equal and
 * opposite reversal and marks the original 'reversed', so the ledger remains an
 * append-only record of what was decided and when.
 */
export const TRANSACTION_STATUSES = [
  'pending',
  'posted',
  'rejected',
  'discarded',
  'reversed',
] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

/** What a pending entry is asking permission to do. */
export const APPROVAL_ACTIONS = ['post', 'reverse'] as const
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number]

/**
 * Roles permitted to see the club's finances and to approve entries.
 *
 * "Accountant" in everyday club usage is the treasurer here, matching SRS §3.
 * Ordinary members are deliberately absent: they cannot read finance data at
 * all, which the Firestore rules enforce independently of the UI.
 */
export const FINANCE_ROLES: readonly Role[] = [
  'treasurer',
  'secretary',
  'president',
  'administrator',
]

/**
 * Approvals required *in addition to* the officer who recorded the entry.
 *
 * **1 — two people in total, and never a third.** Whoever records an entry cannot
 * approve it; exactly one other office bearer does, and it posts. Any of the finance
 * roles can be that person, so the club is not held up when one of them is away.
 *
 * The number that follows from this is easy to misread, and the club did misread it:
 * the officer who recorded an entry clicks Approve, is refused, and it reads as
 * "somebody has already approved this and it still wants another". It does not. It
 * wants one signature, from anyone but the author. `approvalsOutstanding` is
 * therefore shown on screen — "needs 1 more approval" — rather than left to be
 * inferred from a refusal.
 *
 * Raise it to 2 and three different people are needed. Set it to 0 and recording
 * posts immediately, with no second pair of eyes at all — the club ran that way
 * briefly and it is the wrong default for money.
 *
 * What this rule gives, concretely:
 *
 *   • no single person can move the club's money
 *   • an entry cannot be edited by anyone, its author included — there is no route
 *     that changes a recorded entry's amount, date or description. A mistake is
 *     withdrawn before anyone approves it, or reversed afterwards, and the reversal
 *     needs its own second signature
 *   • the same applies to every office bearer equally. There is no rank that skips
 *     the check: a president's entry needs a second signature exactly as a
 *     treasurer's does
 */
export const REQUIRED_APPROVALS = 1

// --- Membership dues (SRS §7) ----------------------------------------------

/**
 * What membership costs, in paise.
 *
 * Twelve months at the monthly rate comes to exactly the yearly rate, so paying by
 * the year is a convenience rather than a discount. `duesForMonths` in
 * domain/membership.ts is the single place that turns a number of months into an
 * amount, so if the club ever does introduce a discount it changes there and every
 * screen follows.
 */
export const MEMBERSHIP_DUES = {
  monthlyPaise: 5_000,
  yearlyPaise: 60_000,
  monthsInYear: 12,
} as const

/**
 * The club's year runs April to March, as an Indian financial year does.
 *
 * Written as the starting month rather than assumed, because every "which year does
 * this month belong to" question in the membership register depends on it, and a
 * club that later moves to a calendar year should change one number.
 */
export const FINANCIAL_YEAR_START_MONTH = 4

/**
 * The first year the club keeps its books in this system.
 *
 * Every year picker starts here, and none offers anything earlier. Before this the
 * club's records are on paper and in somebody's cupboard; a dropdown offering 2024-25
 * would only ever produce an empty register and a confused treasurer.
 */
export const FIRST_FINANCIAL_YEAR = '2026-27'
// #endregion shared-domain
