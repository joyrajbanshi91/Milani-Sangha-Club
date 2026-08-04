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
 * statement, the cash box, the cheque. Approving it creates a normal `Transaction`
 * in the 'pending' state, so the money still needs a second officer before it
 * reaches a balance. That is why this is a separate shape rather than a
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

  /** UPI transaction id or cheque number. Required for 'upi' and 'bank'. */
  externalReference?: string
  /** Which office bearer took the cash, in the member's words. Cash only. */
  handedTo?: string
  /** Anything else the member wants the treasurer to know. */
  note?: string

  /** ISO timestamp. */
  submittedAt: string

  /** Set when an officer recorded or declined it. */
  reviewedAt?: string
  reviewedBy?: string
  reviewedByName?: string
  /** Why an officer could not accept it. */
  declineReason?: string

  /** The pending ledger entry an officer created from this declaration. */
  transactionId?: string
  transactionReference?: string

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
  | 'externalReference'
  | 'handedTo'
  | 'note'
>
