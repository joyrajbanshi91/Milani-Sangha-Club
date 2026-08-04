import type { Outcome } from '../domain/approval.js'
import { todayInIndia } from '../domain/dates.js'
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

    const draft = buildEntryFor(existing, actor, choice)
    const entry = await this.finance.createEntry(
      choice.note ? { ...draft, description: `${draft.description} — ${choice.note}` } : draft,
      actor
    )

    // A rejected draft is the officer's fund or category being wrong, so the
    // declaration must stay in the queue for them to try again.
    if (!entry.ok) return entry

    try {
      const saved = await this.store.update(
        id,
        markVerified(existing, actor, this.now(), entry.value),
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
