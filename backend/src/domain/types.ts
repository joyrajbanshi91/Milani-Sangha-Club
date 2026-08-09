import type {
  CategoryKind,
  FundKind,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
  Role,
  TransactionKind,
  TransactionStatus,
} from '../config/constants.js'

/**
 * Domain shapes for the officer finance area.
 *
 * Deliberately free of Firestore types: every rule about money in this system is
 * expressed as a pure function over these plain objects, so the arithmetic and
 * the approval rules can be tested exhaustively without a database, credentials
 * or a network. The repository layer converts to and from documents.
 *
 * Dates: `date` is the accounting date as 'YYYY-MM-DD' (what the committee would
 * write in a cash book). Timestamps are full ISO strings. Both sort correctly as
 * plain strings, which keeps range queries simple.
 */

/** A place the club's money sits: cash box, bank account, UPI handle. */
export interface Fund {
  id: string
  name: string
  kind: FundKind
  /** Balance before the first recorded transaction. */
  openingBalancePaise: number
  /** 'YYYY-MM-DD' — the date the opening balance was taken. */
  openingDate: string
  active: boolean
  notes?: string
}

/** An income or expense heading, e.g. "Membership fees", "Ground maintenance". */
export interface Category {
  id: string
  name: string
  kind: CategoryKind
  active: boolean
  notes?: string
}

/** One officer's signature on a pending entry. */
export interface Approval {
  uid: string
  name: string
  role: Role
  /** ISO timestamp. */
  at: string
  note?: string
}

export interface Transaction {
  id: string
  /** Human-facing reference, e.g. 'TXN-2026-000042'. Allocated server-side. */
  reference: string
  kind: TransactionKind
  status: TransactionStatus
  /** Accounting date, 'YYYY-MM-DD'. */
  date: string
  amountPaise: number
  /** Fund the money leaves (expense, transfer) or enters (income). */
  fundId: string
  /** Destination fund. Transfers only. */
  toFundId?: string
  /** Income and expense only; a transfer moves money without a category. */
  categoryId?: string
  /**
   * Where the money came from or went to, in the committee's own words —
   * "Ward 12 collection drive", "Sharma Hardware". Free text on purpose: a club
   * cannot predict its sources, and forcing a code list produces "Other" for
   * everything.
   */
  source: string
  description: string
  /** Cheque number, UPI reference, bill number. */
  externalReference?: string

  createdBy: string
  createdByName: string
  /** ISO timestamp. */
  createdAt: string

  /** Signatures gathered so far. Never includes `createdBy`. */
  approvals: Approval[]

  /** Set when the entry reached 'posted'. */
  postedAt?: string
  /** Set when a second officer declined it. */
  rejectedAt?: string
  rejectedBy?: string
  rejectionReason?: string

  /** On a reversal entry: the posted transaction it cancels. */
  reverses?: string
  /** On a reversed original: the reversal entry that cancelled it. */
  reversedBy?: string

  /** Set when the entry came from a CSV import, for traceability. */
  importBatchId?: string
}

/** A transaction before it has an id or a reference — what a form produces. */
export type TransactionDraft = Omit<
  Transaction,
  | 'id'
  | 'reference'
  | 'status'
  | 'approvals'
  | 'createdAt'
  | 'postedAt'
  | 'rejectedAt'
  | 'rejectedBy'
  | 'rejectionReason'
  | 'reversedBy'
>

/**
 * What a financial year was started with.
 *
 * The carry-forward the committee adopted, per fund. Its existence also settles the
 * year before — see domain/financialYear.ts for why that is one fact rather than two.
 */
export interface YearOpening {
  id: string
  /** '2027-28'. */
  financialYear: string
  /** Fund id → paise, as adopted. A fund absent from this starts at zero. */
  balances: Record<string, number>
  /** What the ledger computed at the time, kept so a later difference is explicable. */
  suggestedTotalPaise: number
  /** Why the adopted figure differs, if it does. */
  note?: string

  createdAt: string
  createdBy: string
  createdByName: string
}

/** Who is acting, as established from their verified ID token. */
export interface Actor {
  uid: string
  name: string
  role: Role
}

/**
 * A member's declaration that they have paid the club something.
 *
 * Deliberately *not* a ledger entry. It is one member's claim, sitting outside the
 * accounts until an officer checks it against the club's records — the UPI
 * statement, the cash box, the cheque. Accepting it creates a normal `Transaction`,
 * posted on that officer's check — the member is the maker, and no officer may accept
 * a declaration of their own. That is why this is a separate shape rather than a
 * `Transaction` with an extra status: a member can write one, and nothing a member
 * can write may ever be part of the ledger.
 */
export interface Payment {
  id: string
  /** Human-facing acknowledgement, e.g. 'REF-2026-000042'. Allocated server-side. */
  reference: string
  status: PaymentStatus

  /** Whose payment this is — their account id, taken from the verified token. */
  memberUid: string
  memberName: string

  purpose: PaymentPurpose
  method: PaymentMethod
  amountPaise: number
  /** The date the member says they paid, 'YYYY-MM-DD'. */
  paidOn: string

  /**
   * Which months of membership this pays for, inclusive, as 'YYYY-MM'.
   *
   * Membership only — a donation buys no months. Both are set together or neither
   * is, and a single payment never crosses a financial year, so the receipt can name
   * the year it belongs to and the register can add months up without ambiguity.
   */
  periodStart?: string
  periodEnd?: string

  /** UPI transaction id or cheque number. Required for 'upi' and 'bank'. */
  externalReference?: string
  /** Which office bearer took the cash, in the member's words. Cash only. */
  handedTo?: string
  /** Anything else the member wants the treasurer to know. */
  note?: string

  /**
   * The code that proves this receipt is the club's, e.g. '4K7P2WQ9XB'.
   *
   * Unguessable, unique, and allocated when the member declares the payment — so it
   * is on the acknowledgement before any money is confirmed and on the receipt
   * afterwards. The sequential `reference` orders the books; this authenticates them.
   * See lib/securityCode.ts for why both are needed.
   *
   * Optional because declarations recorded before the club had codes do not have one,
   * and their receipts must still print.
   */
  securityCode?: string

  /**
   * Set when an officer entered this for a member who cannot use the app.
   *
   * Plenty of members have an account they have never signed into — no smartphone, a
   * forgotten password, no wish to learn. They still pay their subscription, in cash,
   * to whoever is at the club that evening. Without this the money either never
   * reaches the member's record or is entered under the officer's own name, and the
   * member's page says they have paid nothing all year.
   *
   * It changes who the *maker* is, which is the part that matters. A declaration
   * normally comes from the member, so the officer accepting it is the second pair of
   * eyes and it posts on their signature. Here the officer is the maker, so a
   * different officer has to be the checker — `canReview` refuses whoever recorded it,
   * exactly as it refuses an officer their own declaration.
   */
  recordedOnBehalf?: boolean
  /** The officer who entered it. Never the member. */
  recordedBy?: string
  recordedByName?: string
  recordedByRole?: Role

  /** ISO timestamp. */
  submittedAt: string

  /** Set when an officer recorded or declined it. */
  reviewedAt?: string
  reviewedBy?: string
  reviewedByName?: string
  /** Why an officer could not accept it. */
  declineReason?: string

  /** The ledger entry an officer created from this declaration. */
  transactionId?: string
  transactionReference?: string

  /**
   * The receipt, once one exists. 'RCT-2026-000042'.
   *
   * Allocated at the moment an officer verifies the payment and never before: a
   * receipt number handed out at declaration time would be a numbered receipt for
   * money nobody has confirmed arrived, which is the one document a club cannot
   * afford to issue speculatively.
   */
  receiptNumber?: string

  /** Set when the member took their own declaration back. */
  withdrawnAt?: string
}

/** What the member's form produces, before a reference or a status exists. */
export type PaymentDraft = Pick<
  Payment,
  | 'memberUid'
  | 'memberName'
  | 'purpose'
  | 'method'
  | 'amountPaise'
  | 'paidOn'
  | 'periodStart'
  | 'periodEnd'
  | 'externalReference'
  | 'handedTo'
  | 'note'
>
