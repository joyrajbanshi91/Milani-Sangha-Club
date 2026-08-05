import type { Role } from '../config/constants.js'
import type { Outcome } from '../domain/approval.js'
import { todayInIndia } from '../domain/dates.js'
import { earliestOpenDate } from '../domain/financialYear.js'
import {
  financialYearOf,
  membershipStatus,
  type MembershipStatus,
} from '../domain/membership.js'
import {
  buildEntryFor,
  canReview,
  decline as declinePayment,
  markVerified,
  validatePaymentDraft,
  withdraw as withdrawPayment,
} from '../domain/payments.js'
import type { Actor, Payment, PaymentDraft, Transaction } from '../domain/types.js'
import { logger } from '../lib/logger.js'
import type { AuditEntry, FinanceService } from './financeService.js'
import type { PaymentStore } from './paymentStore.js'

/**
 * Member payment declarations, and the handover into the ledger.
 *
 * The interesting method is `record`. Everything else is a member writing or
 * withdrawing their own claim; `record` is the moment a claim becomes money, and it
 * is written to keep two guarantees that are easy to lose:
 *
 *   1. **The ledger entry is created first.** If writing to the ledger fails, the
 *      declaration stays in the queue — a declaration marked verified while no
 *      entry exists is money the club believes it received and cannot find.
 *      The reverse failure is survivable and visible: an entry exists, the
 *      declaration is still queued, and recording it again would produce a
 *      duplicate the officer can see and reverse.
 *
 *   2. **The entry is pending, never posted.** It is created through
 *      `FinanceService.createEntry` — the same path the officer's own manual form
 *      uses — so the two-person rule applies untouched. Recording a member's
 *      payment gives it one signature, the recording officer's; a second officer
 *      still has to approve it before any balance moves. Nothing here is allowed to
 *      be a shortcut into the accounts.
 */
export class PaymentService {
  constructor(
    private readonly store: PaymentStore,
    private readonly finance: FinanceService,
    private readonly audit: (entry: AuditEntry) => Promise<void>
  ) {}

  private now(): string {
    return new Date().toISOString()
  }

  // -------------------------------------------------------------------------
  // The member's own declarations
  // -------------------------------------------------------------------------

  /** One member's own history. Never anybody else's. */
  listMine(memberUid: string): Promise<Payment[]> {
    return this.store.listForMember(memberUid)
  }

  /**
   * One member's subscription register for a financial year.
   *
   * Computed from their approved declarations every time rather than stored, so it
   * cannot drift from the money — see the note at the top of domain/membership.ts.
   */
  async membership(memberUid: string, financialYear?: string): Promise<MembershipStatus> {
    const today = todayInIndia()

    return membershipStatus({
      financialYear: financialYear ?? financialYearOf(today),
      payments: await this.store.listForMember(memberUid),
      today,
    })
  }

  /**
   * Every member, with what they have paid — the officers' roster.
   *
   * Built by reading the payments table once and grouping in memory rather than
   * asking per member. A club of a few hundred is one query either way, and the
   * alternative is a request per member on every page load.
   *
   * Accounts come from the authentication service, not from the payments table:
   * a member who has never paid anything must appear on this list — they are
   * precisely the row an officer is looking for.
   */
  async roster(
    accounts: readonly { uid: string; name: string; email: string; role: Role }[],
    financialYear?: string
  ): Promise<MemberRegisterRow[]> {
    const today = todayInIndia()
    const year = financialYear ?? financialYearOf(today)

    const all = await this.store.list({ status: 'all', limit: 5000 })

    const byMember = new Map<string, Payment[]>()
    for (const payment of all) {
      const existing = byMember.get(payment.memberUid)
      if (existing) existing.push(payment)
      else byMember.set(payment.memberUid, [payment])
    }

    const rows: MemberRegisterRow[] = accounts.map((account) => {
      const payments = byMember.get(account.uid) ?? []

      return {
        uid: account.uid,
        name: account.name,
        email: account.email,
        role: account.role,
        former: false,
        membership: membershipStatus({ financialYear: year, payments, today }),
        awaitingVerification: payments.filter(
          (payment) => payment.status === 'pending_verification'
        ).length,
      }
    })

    /**
     * People who have paid the club but no longer have an account.
     *
     * Deleting a member deletes their sign-in, not their money. Their payments stay
     * in the ledger — the club has the cash, and an entry that vanished would leave
     * the accounts short with nothing explaining it — so they stay on this register
     * too, marked as former members.
     *
     * Without this they would disappear from the roster while their money remained in
     * the totals, and the two would never add up again.
     */
    const known = new Set(accounts.map((account) => account.uid))

    for (const [uid, payments] of byMember) {
      if (known.has(uid)) continue

      const name = payments[payments.length - 1]?.memberName ?? 'Former member'
      const register = membershipStatus({ financialYear: year, payments, today })

      // Only worth listing for a year they actually paid something towards; a former
      // member owes the club nothing, so their unpaid months are not a debt.
      if (register.monthsPaid === 0) continue

      rows.push({
        uid,
        name,
        email: '',
        role: 'member',
        former: true,
        membership: { ...register, monthsOverdue: 0, overduePaise: 0 },
        awaitingVerification: 0,
      })
    }

    return rows
      .sort(
        (a, b) =>
          // Who owes the most, first: the list exists to be acted on, and a roster
          // sorted alphabetically buries the people it is meant to surface.
          b.membership.monthsOverdue - a.membership.monthsOverdue ||
          a.name.localeCompare(b.name)
      )
  }

  /**
   * Declare a payment.
   *
   * Open to every signed-in account — a general member and a committee member use
   * the same form, because both pay their subscription the same way.
   */
  async submit(draft: PaymentDraft, actor: Actor): Promise<Outcome<Payment>> {
    // The member's own declarations, and only for the duplicate check. Passing the
    // whole club's would leak that other people have paid.
    const existing = await this.store.listForMember(actor.uid)

    const valid = validatePaymentDraft(draft, { today: todayInIndia(), existing })
    if (!valid.ok) return valid

    const created = await this.store.create({
      ...draft,
      status: 'pending_verification',
      submittedAt: this.now(),
    })

    await this.audit({
      action: 'payment.declared',
      actor,
      targetId: created.id,
      details: {
        reference: created.reference,
        amountPaise: created.amountPaise,
        method: created.method,
        purpose: created.purpose,
      },
    })

    return { ok: true, value: created }
  }

  /** Take back one's own declaration, while nobody has acted on it. */
  async withdraw(id: string, actor: Actor): Promise<Outcome<Payment>> {
    const existing = await this.store.get(id)

    // Deliberately the same answer as a declaration belonging to somebody else:
    // guessing ids must not reveal which ones exist.
    if (!existing || existing.memberUid !== actor.uid) return notFound()

    const result = withdrawPayment(existing, actor, this.now())
    if (!result.ok) return result

    const saved = await this.store.update(id, result.value, 'pending_verification')
    await this.audit({
      action: 'payment.withdrawn',
      actor,
      targetId: saved.id,
      details: { reference: saved.reference },
    })

    return { ok: true, value: saved }
  }

  // -------------------------------------------------------------------------
  // The officer's queue
  // -------------------------------------------------------------------------

  list(filter?: { status?: Payment['status'] | 'all' }): Promise<Payment[]> {
    return this.store.list(filter)
  }

  /** Any member's declaration, by id. Officer routes only — there is no scoping. */
  get(id: string): Promise<Payment | null> {
    return this.store.get(id)
  }

  /**
   * Confirm a member's payment and enter it in the books.
   *
   * The officer chooses the fund and category, because only they know which cash
   * box or account the money actually landed in — a member's claim cannot decide
   * where the club's chart of accounts puts it.
   */
  async record(
    id: string,
    actor: Actor,
    choice: { fundId: string; categoryId: string; note?: string }
  ): Promise<Outcome<{ payment: Payment; transaction: Transaction }>> {
    const existing = await this.store.get(id)
    if (!existing) return notFound()

    const permitted = canReview(existing, actor)
    if (!permitted.ok) return permitted

    /**
     * Where the money may land, given the years the club has closed.
     *
     * A subscription paid in March but declared in June, after the year was closed,
     * cannot be dated back into it — the committee has adopted that year's
     * carry-forward. It is entered on the first day of the open year instead, and the
     * member's months are still marked against the year they paid for.
     */
    const openings = await this.finance.listYearOpenings()
    const earliest = earliestOpenDate(openings)

    const draft = buildEntryFor(existing, actor, {
      ...choice,
      ...(earliest ? { earliestDate: earliest } : {}),
    })
    const entry = await this.finance.createEntry(
      choice.note ? { ...draft, description: `${draft.description} — ${choice.note}` } : draft,
      actor
    )

    // A rejected draft is the officer's fund or category being wrong, so the
    // declaration must stay in the queue for them to try again.
    if (!entry.ok) return entry

    try {
      // Numbered by the year the money was paid, not the year it was verified, so a
      // receipt issued in April for a March payment sits in the right book.
      const receiptNumber = await this.store.nextReceiptNumber(Number(existing.paidOn.slice(0, 4)))

      const saved = await this.store.update(
        id,
        markVerified(existing, actor, this.now(), entry.value, receiptNumber),
        'pending_verification'
      )

      await this.audit({
        action: 'payment.verified',
        actor,
        targetId: saved.id,
        details: {
          reference: saved.reference,
          amountPaise: saved.amountPaise,
          member: saved.memberName,
          entry: entry.value.reference,
          receipt: saved.receiptNumber,
        },
      })

      return { ok: true, value: { payment: saved, transaction: entry.value } }
    } catch (error) {
      /**
       * The entry exists and the declaration could not be marked.
       *
       * Almost always the optimistic lock: another officer recorded the same
       * declaration a moment earlier. Reported loudly because the pending entry
       * this call created is now unattached — the officer must withdraw it, and
       * they can only do that if they are told.
       */
      logger.error(
        { err: error, payment: existing.reference, entry: entry.value.reference },
        'PAYMENT ENTRY CREATED BUT THE DECLARATION WAS NOT MARKED VERIFIED'
      )

      return {
        ok: false,
        code: 'entry_orphaned',
        reason:
          `Entry ${entry.value.reference} was created in the ledger, but this payment could not be ` +
          'marked as verified — somebody else may have just recorded it. Check the entries list and ' +
          'withdraw the duplicate.',
      }
    }
  }

  /** Decline a declaration. Nothing was created, so one officer is enough. */
  async decline(id: string, actor: Actor, reason: string): Promise<Outcome<Payment>> {
    const existing = await this.store.get(id)
    if (!existing) return notFound()

    const result = declinePayment(existing, actor, this.now(), reason)
    if (!result.ok) return result

    const saved = await this.store.update(id, result.value, 'pending_verification')
    await this.audit({
      action: 'payment.declined',
      actor,
      targetId: saved.id,
      details: { reference: saved.reference, reason: saved.declineReason },
    })

    return { ok: true, value: saved }
  }
}

function notFound<T>(): Outcome<T> {
  return { ok: false, code: 'not_found', reason: 'That payment could not be found.' }
}

/** One line of the officers' membership roster. */
export interface MemberRegisterRow {
  uid: string
  name: string
  email: string
  role: Role
  /**
   * The account is gone but the money is not.
   *
   * A former member's payments stay in the ledger and in this register; what they
   * have not paid is no longer a debt, so nothing about them is shown as overdue.
   */
  former: boolean
  membership: MembershipStatus
  /** Declarations from this member still waiting to be checked. */
  awaitingVerification: number
}
