import type {
  CategoryKind,
  FundKind,
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
