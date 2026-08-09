import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import {
  CATEGORY_KINDS,
  FUND_KINDS,
  MEMBERSHIP_DUES,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
} from '../config/constants.js'
import { isIsoDate, isIsoMonth, todayInIndia } from '../domain/dates.js'
import { isFinancialYear, previousYear } from '../domain/financialYear.js'
import { financialYearOf } from '../domain/membership.js'
import { rupeesToPaise } from '../domain/money.js'
import { monthRange } from '../domain/report.js'
import { approvalsOutstanding } from '../domain/approval.js'
import type { Actor, Transaction } from '../domain/types.js'
import { AppError, badRequest, forbidden, notFound, unauthorised } from '../lib/httpError.js'
import { sendReceipt } from '../lib/receiptResponse.js'
import { requireAuth, requireFinanceOfficer, requireFinanceWriter } from '../middleware/auth.js'
import { getContainer } from '../services/container.js'
import { StoreConflictError } from '../services/store.js'

/**
 * Finance API.
 *
 * Every route below sits behind `requireAuth` and `requireFinanceOfficer`, so an
 * ordinary member cannot reach any of it. The Firestore rules deny the same
 * collections independently — two locks, because this is the club's money.
 */
export const financeRouter = Router()

const { auth, finance, store, payments } = getContainer()

financeRouter.use(requireAuth(auth), requireFinanceOfficer)

function actorOf(req: Request): Actor {
  const actor = req.actor
  if (!actor) throw unauthorised()
  return actor
}

/**
 * Read a single route parameter.
 *
 * Express 5 types params as `string | string[]`, because a pattern can capture
 * repeats. These routes never do, but the check is cheap and beats a cast.
 */
function param(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value === '') throw badRequest(`Missing ${name}.`)
  return value
}

/** Amounts arrive either as rupees typed by a person or as exact paise. */
const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return rupeesToPaise(value)
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid amount',
      })
      return z.NEVER
    }
  })

const isoDate = z.string().refine(isIsoDate, 'Use the format YYYY-MM-DD')

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

financeRouter.get('/funds', async (_req: Request, res: Response) => {
  res.json({ funds: await finance.listFunds() })
})

const fundSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(FUND_KINDS),
  openingBalance: amountSchema.default(0),
  openingDate: isoDate,
  notes: z.string().trim().optional(),
})

financeRouter.post('/funds', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = fundSchema.parse(req.body)
  const created = await store.createFund({
    name: input.name,
    kind: input.kind,
    openingBalancePaise: input.openingBalance,
    openingDate: input.openingDate,
    active: true,
    ...(input.notes ? { notes: input.notes } : {}),
  })
  res.status(201).json({ fund: created })
})

financeRouter.get('/categories', async (_req: Request, res: Response) => {
  res.json({ categories: await finance.listCategories() })
})

const categorySchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(CATEGORY_KINDS),
  notes: z.string().trim().optional(),
})

financeRouter.post('/categories', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = categorySchema.parse(req.body)
  const created = await store.createCategory({
    name: input.name,
    kind: input.kind,
    active: true,
    ...(input.notes ? { notes: input.notes } : {}),
  })
  res.status(201).json({ category: created })
})

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Resolve ?month=YYYY-MM or ?from=&to= into a period, defaulting to this month. */
function periodFrom(req: Request): { from: string; to: string } {
  const { month, from, to } = req.query

  if (typeof month === 'string') {
    if (!isIsoMonth(month)) throw badRequest('month must be in the format YYYY-MM')
    return monthRange(month)
  }

  if (typeof from === 'string' || typeof to === 'string') {
    if (typeof from !== 'string' || !isIsoDate(from)) throw badRequest('from must be YYYY-MM-DD')
    if (typeof to !== 'string' || !isIsoDate(to)) throw badRequest('to must be YYYY-MM-DD')
    if (to < from) throw badRequest('The end of the period cannot be before its start.')
    return { from, to }
  }

  return monthRange(todayInIndia().slice(0, 7))
}

financeRouter.get('/dashboard', async (req: Request, res: Response) => {
  res.json(await finance.dashboard(periodFrom(req)))
})

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

financeRouter.get('/transactions', async (req: Request, res: Response) => {
  const status = req.query.status
  const parsedStatus =
    typeof status === 'string' && (status === 'all' || TRANSACTION_STATUSES.includes(status as never))
      ? (status as 'all')
      : 'all'

  const transactions = await finance.listTransactions({
    status: parsedStatus,
    ...(typeof req.query.from === 'string' && isIsoDate(req.query.from)
      ? { from: req.query.from }
      : {}),
    ...(typeof req.query.to === 'string' && isIsoDate(req.query.to) ? { to: req.query.to } : {}),
    ...(typeof req.query.fundId === 'string' ? { fundId: req.query.fundId } : {}),
    ...(typeof req.query.categoryId === 'string' ? { categoryId: req.query.categoryId } : {}),
    ...(typeof req.query.search === 'string' ? { search: req.query.search } : {}),
    limit: 500,
  })

  res.json({ transactions })
})

const entrySchema = z
  .object({
    kind: z.enum(TRANSACTION_KINDS),
    date: isoDate,
    amount: amountSchema,
    fundId: z.string().min(1),
    toFundId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    source: z.string().trim().min(1, 'Say where the money came from or went to'),
    description: z.string().trim().min(1, 'Add a short description'),
    externalReference: z.string().trim().optional(),
  })
  .refine((value) => value.date <= todayInIndia(), {
    // A future-dated entry would sit in the ledger affecting balances for a day
    // that has not happened. Backdating is allowed; forward-dating is not.
    message: 'The date cannot be in the future.',
    path: ['date'],
  })

financeRouter.post('/transactions', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = entrySchema.parse(req.body)
  const actor = actorOf(req)

  const result = await finance.createEntry(
    {
      kind: input.kind,
      date: input.date,
      amountPaise: input.amount,
      fundId: input.fundId,
      ...(input.toFundId ? { toFundId: input.toFundId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      source: input.source,
      description: input.description,
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      createdBy: actor.uid,
      createdByName: actor.name,
    },
    actor
  )

  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    transaction: result.value,
    message: approvalMessage(result.value),
  })
})

const approvalSchema = z.object({ note: z.string().trim().max(500).optional() })
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason') })

financeRouter.post('/transactions/:id/approve', requireFinanceWriter, async (req: Request, res: Response) => {
  const { note } = approvalSchema.parse(req.body ?? {})
  const id = param(req, 'id')

  const result = await finance.approve(id, actorOf(req), note)
  if (!result.ok) throw toHttpError(result)

  res.json({
    transaction: result.value,
    message:
      result.value.status === 'posted'
        ? 'Approved and posted. The balances now include it.'
        : approvalMessage(result.value),
  })
})

financeRouter.post('/transactions/:id/reject', requireFinanceWriter, async (req: Request, res: Response) => {
  const { reason } = reasonSchema.parse(req.body)
  const id = param(req, 'id')

  const result = await finance.reject(id, actorOf(req), reason)
  if (!result.ok) throw toHttpError(result)
  res.json({ transaction: result.value, message: 'Rejected.' })
})

financeRouter.post('/transactions/:id/withdraw', requireFinanceWriter, async (req: Request, res: Response) => {
  const id = param(req, 'id')

  const result = await finance.discard(id, actorOf(req))
  if (!result.ok) throw toHttpError(result)
  res.json({ transaction: result.value, message: 'Withdrawn.' })
})

/**
 * Cancel a posted entry.
 *
 * Not DELETE, because nothing is deleted: this creates the opposite entry, which
 * itself needs a second officer. The original stays in the ledger.
 */
financeRouter.post('/transactions/:id/reverse', requireFinanceWriter, async (req: Request, res: Response) => {
  const { reason } = reasonSchema.parse(req.body)
  const id = param(req, 'id')

  const result = await finance.requestReversal(id, actorOf(req), reason)
  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    transaction: result.value,
    message:
      result.value.status === 'posted'
        ? 'Reversed. The original entry is cancelled and both halves stay on the record.'
        : `A reversal has been recorded. ${approvalMessage(result.value)} The original is cancelled once it is.`,
  })
})

// ---------------------------------------------------------------------------
// Members' payment declarations
//
// The officer's half of the flow that begins at POST /members/me/payments. The
// member says what they paid; an officer checks it against the club's records and
// either enters it in the books or says why not.
//
// Accepting one **posts it to the books there and then**, on that officer's signature.
// Two people have been involved by that point — the member who put the money forward
// and the bearer who checked it — and `canReview` guarantees they are not the same
// person. Asking a third would leave the member holding a receipt for money the club's
// own figures did not yet include.
//
// A payment an officer records *for* a member (POST /finance/payments, below) turns the
// same machinery round: the officer is the maker, so a different bearer must be the
// checker, and `canReview` refuses whoever recorded it. Two people either way.
// ---------------------------------------------------------------------------

financeRouter.get('/payments', async (req: Request, res: Response) => {
  const status = req.query.status
  const parsedStatus =
    typeof status === 'string' && (status === 'all' || PAYMENT_STATUSES.includes(status as never))
      ? (status as 'all')
      : 'pending_verification'

  res.json({ payments: await payments.list({ status: parsedStatus }) })
})

const isMonthString = z.string().refine(isIsoMonth, 'Use the format YYYY-MM, e.g. 2026-04')

/**
 * Mirrors the member's own form, with one field added: whose payment it is.
 *
 * `.strict()` so a field nobody meant to send is refused rather than ignored — the
 * fields this route does *not* take are the point of it. Status, reference, receipt
 * number and the recorded-by trio are all decided by the server.
 */
const onBehalfSchema = z
  .object({
    memberUid: z.string().min(1, 'Choose which member this payment is for'),
    purpose: z.enum(PAYMENT_PURPOSES),
    method: z.enum(PAYMENT_METHODS),
    periodStart: isMonthString.optional(),
    periodEnd: isMonthString.optional(),
    amount: amountSchema,
    paidOn: isoDate,
    externalReference: z.string().trim().max(128).optional(),
    handedTo: z.string().trim().max(128).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

/**
 * Record a payment for a member who cannot use the app.
 *
 * The member's name is read from their account, never from the request: an officer
 * choosing a name from a list and an officer typing one into a box are different
 * things, and only the first can be reconciled against the club's register.
 *
 * It lands in the same verification queue as a member's own declaration, so nothing
 * about the money's route into the books changes — except who has to accept it, which
 * is now anybody except the officer who recorded it.
 */
financeRouter.post('/payments', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = onBehalfSchema.parse(req.body)
  const actor = actorOf(req)

  const member = (await auth.listAccounts()).find((account) => account.uid === input.memberUid)
  if (!member) {
    throw notFound(
      'That member could not be found. They may have been removed since this page was opened.'
    )
  }

  const result = await payments.submitFor(
    {
      memberUid: member.uid,
      memberName: member.name,
      purpose: input.purpose,
      method: input.method,
      amountPaise: input.amount,
      paidOn: input.paidOn,
      ...(input.periodStart ? { periodStart: input.periodStart } : {}),
      ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      // Cash with nobody named would fail validation, and the honest default is the
      // officer entering it — they are the one who has the money.
      handedTo: input.handedTo?.trim() ? input.handedTo : actor.name,
      ...(input.note ? { note: input.note } : {}),
    },
    actor
  )

  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    payment: result.value,
    message:
      `Recorded for ${member.name}. Acknowledgement ${result.value.reference}. ` +
      'Another office bearer must accept it before it reaches the books and a receipt is issued — ' +
      'you cannot accept your own entry.',
  })
})

/**
 * Is this receipt the club's?
 *
 * An officer with a piece of paper in front of them, typing the code off it. The
 * sequential number on a receipt can be guessed by anybody holding one genuine
 * receipt; the code cannot, so a document whose code has no record behind it was not
 * issued by this club.
 *
 * Answers `{ payment: null }` rather than 404 for a code nobody recognises: a 404 in a
 * browser console reads as a broken screen, and this is a legitimate answer to a
 * legitimate question. Officers only — a member has their own receipts already, and
 * this endpoint would otherwise let anybody test codes until one hit.
 */
financeRouter.get('/payments/verify', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  if (code.trim() === '') throw badRequest('Type the verification code from the receipt.')

  const payment = await payments.findByCode(code)

  res.json({
    payment,
    message: payment
      ? `Issued to ${payment.memberName} on ${payment.paidOn}.`
      : 'No receipt in the club’s records carries that code. Check the code, then treat the document as unverified.',
  })
})

const recordSchema = z.object({
  fundId: z.string().min(1, 'Choose which fund the money went into'),
  categoryId: z.string().min(1, 'Choose a category'),
  note: z.string().trim().max(200).optional(),
})

financeRouter.post('/payments/:id/record', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = recordSchema.parse(req.body)
  const id = param(req, 'id')

  const result = await payments.record(id, actorOf(req), input)
  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    payment: result.value.payment,
    transaction: result.value.transaction,
    message:
      `Verified and entered as ${result.value.transaction.reference}, and receipt ` +
      `${result.value.payment.receiptNumber ?? ''} issued. ` +
      approvalMessage(result.value.transaction),
  })
})

financeRouter.post('/payments/:id/decline', requireFinanceWriter, async (req: Request, res: Response) => {
  const { reason } = reasonSchema.parse(req.body)
  const id = param(req, 'id')

  const result = await payments.decline(id, actorOf(req), reason)
  if (!result.ok) throw toHttpError(result)

  res.json({ payment: result.value, message: 'Declined. The member can see your reason.' })
})

/** Reprint a member's receipt — the commonest request an office ever gets. */
financeRouter.get('/payments/:id/receipt.pdf', async (req: Request, res: Response) => {
  const payment = await payments.get(param(req, 'id'))
  if (!payment) throw notFound('That payment could not be found.')

  await sendReceipt(res, payment, (id) => store.getTransaction(id))
})

// ---------------------------------------------------------------------------
// Financial years and the carry-forward
// ---------------------------------------------------------------------------

/**
 * What the club has opened, and what it would carry into the year asked about.
 *
 * The suggestion is computed on demand rather than stored, so it always reflects the
 * ledger as it stands — including an entry recorded five minutes ago in the year
 * being closed.
 */
financeRouter.get('/years', async (req: Request, res: Response) => {
  const year = typeof req.query.suggestFor === 'string' ? req.query.suggestFor : undefined
  if (year !== undefined && !isFinancialYear(year)) {
    throw badRequest('suggestFor must look like 2027-28')
  }

  res.json({
    years: await finance.listYearOpenings(),
    ...(year ? { suggestion: await finance.carryForwardSuggestion(year) } : {}),
  })
})

const openYearSchema = z.object({
  financialYear: z.string().refine(isFinancialYear, 'Use the format 2027-28'),
  /** Fund id → rupees, as the committee adopted them. */
  balances: z.record(z.string().min(1), amountSchema),
  note: z.string().trim().max(500).optional(),
})

financeRouter.post('/years', requireFinanceWriter, async (req: Request, res: Response) => {
  const input = openYearSchema.parse(req.body)

  const result = await finance.openYear(
    input.financialYear,
    input.balances,
    actorOf(req),
    input.note
  )
  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    year: result.value,
    message:
      `${input.financialYear} is open, starting from the balances you adopted. ` +
      `${previousYear(input.financialYear)} is now closed — nothing further can be dated into it.`,
  })
})

/** Reopen a year, when the figures adopted turn out to have been wrong. */
financeRouter.delete('/years/:financialYear', requireFinanceWriter, async (req: Request, res: Response) => {
  const financialYear = param(req, 'financialYear')
  if (!isFinancialYear(financialYear)) throw badRequest('Use the format 2027-28')

  const result = await finance.reopenYear(financialYear, actorOf(req))
  if (!result.ok) throw toHttpError(result)

  res.json({
    message:
      `${financialYear} has been reopened, so ${previousYear(financialYear)} can be corrected. ` +
      'Close it again once the figures are right.',
  })
})

// ---------------------------------------------------------------------------
// The membership register
// ---------------------------------------------------------------------------

/**
 * Every member and what they have paid this year.
 *
 * Officer-only, and the one screen in the system that shows one member's affairs to
 * another person — which is exactly what a committee needs in order to chase
 * subscriptions, and exactly why it sits behind `requireFinanceOfficer` with
 * everything else about money.
 */
financeRouter.get('/members', async (req: Request, res: Response) => {
  const year = typeof req.query.year === 'string' ? req.query.year : undefined
  if (year !== undefined && !/^\d{4}-\d{2}$/.test(year)) {
    throw badRequest('year must look like 2026-27')
  }

  const accounts = await auth.listAccounts()
  const members = await payments.roster(accounts, year)

  res.json({
    members,
    financialYear: members[0]?.membership.financialYear ?? financialYearOf(todayInIndia()),
    dues: {
      monthlyPaise: MEMBERSHIP_DUES.monthlyPaise,
      yearlyPaise: MEMBERSHIP_DUES.yearlyPaise,
    },
    totals: {
      members: members.length,
      paidInFull: members.filter((member) => member.membership.paidInFull).length,
      nothingPaid: members.filter((member) => member.membership.nothingPaid).length,
      overduePaise: members.reduce((sum, member) => sum + member.membership.overduePaise, 0),
      outstandingPaise: members.reduce(
        (sum, member) => sum + member.membership.outstandingPaise,
        0
      ),
      awaitingVerification: members.reduce((sum, member) => sum + member.awaitingVerification, 0),
    },
  })
})

/**
 * How many more signatures an entry needs, in words.
 *
 * Always states the number. "It needs a second officer's approval" was read by the
 * club as "somebody has approved it and it still wants another", because the officer
 * who recorded it had just been refused their own approval. One signature, from
 * anyone but the author, is the whole rule — so the message counts it out.
 */
function approvalMessage(transaction: Transaction): string {
  const outstanding = approvalsOutstanding(transaction)

  if (outstanding === 0) return 'Posted. The balances now include it.'

  return (
    `Recorded. It needs ${outstanding} more approval${outstanding === 1 ? '' : 's'} — ` +
    'from any office bearer except you — before it affects any balance.'
  )
}

/** Map a domain refusal onto the right HTTP status. */
function toHttpError(result: { code: string; reason: string }): AppError {
  switch (result.code) {
    case 'not_found':
      return notFound(result.reason)
    case 'not_officer':
      return forbidden(result.reason)
    case 'year_not_started':
    case 'year_closed':
      // Well-formed, and refused because the year it belongs to is settled.
      return new AppError(409, result.code, result.reason)
    case 'entry_orphaned':
      // The ledger was written and the declaration was not. A 500 would be read as
      // "nothing happened", which is the one thing that is not true.
      return new AppError(409, result.code, result.reason)
    case 'self_verification':
    case 'self_record':
    case 'not_open':
    case 'self_approval':
    case 'self_rejection':
    case 'already_approved':
    case 'not_author':
      // 409: the request is well-formed, but conflicts with the two-person rule.
      return new AppError(409, result.code, result.reason)
    case 'not_pending':
    case 'not_posted':
    case 'already_reversed':
      return new AppError(409, result.code, result.reason)
    case 'duplicate':
    case 'months_already_covered':
      // Reachable from POST /payments, recorded for a member. The form was filled in
      // correctly and the months are simply already taken — the same answer the
      // member's own route gives, because it is the same refusal.
      return new AppError(409, result.code, result.reason)
    default:
      return new AppError(400, result.code, result.reason)
  }
}

/** A losing race on the optimistic lock is a 409, not a 500. */
financeRouter.use(
  (error: unknown, _req: Request, _res: Response, next: (error?: unknown) => void) => {
    if (error instanceof StoreConflictError) {
      next(new AppError(409, 'conflict', error.message))
      return
    }
    next(error)
  }
)
