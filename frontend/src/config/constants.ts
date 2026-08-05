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
 *   approved              an officer confirmed the money arrived and entered it
 *                         in the books, and a receipt was issued
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
 * **0 — one officer records an entry and it is posted immediately.** The club asked
 * for this; it was 1, meaning two different people had to sign off before any money
 * moved.
 *
 * Worth being clear about what that costs, because the machinery is all still here
 * and the number is the only thing standing between the two arrangements. At 1, no
 * single person could move the club's money: an officer could record but never
 * approve their own entry. At 0 they can, so the control against a single officer
 * entering whatever they like is no longer the software — it is the audit trail, the
 * reversal record, and the committee reading the statement.
 *
 * What still holds at 0:
 *   • every entry names who recorded it, with a timestamp, in the audit log
 *   • nothing is ever deleted — a mistake is cancelled by a reversal and both
 *     halves stay on the record
 *   • an officer still cannot verify their own membership payment, which is a
 *     different question (did the money arrive?) and matters more, not less, now
 *     that one signature is enough
 *
 * Set it back to 1 and the two-person rule returns with no other change: the
 * approval queue, the self-approval refusal and the tests are all intact.
 */
export const REQUIRED_APPROVALS = 0

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
// #endregion shared-domain
