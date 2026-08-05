import { Router, type Request, type Response } from 'express'

import { isIsoDate, isIsoMonth, todayInIndia } from '../domain/dates.js'
import { lastDayOfMonth, monthRange } from '../domain/report.js'
import { renderFinanceReportPdf, type ReportDetail } from '../lib/pdf/financeReport.js'
import { badRequest, unauthorised } from '../lib/httpError.js'
import { requireAuth, requireFinanceOfficer } from '../middleware/auth.js'
import { getContainer } from '../services/container.js'

/**
 * Period statements, as JSON for the screen and PDF for the committee.
 *
 * Both come from the same `buildPeriodReport`, so the printed statement can never
 * disagree with what the officer saw on the dashboard.
 */
export const reportsRouter = Router()

const { auth, finance } = getContainer()

reportsRouter.use(requireAuth(auth), requireFinanceOfficer)

function resolvePeriod(req: Request): { from: string; to: string } {
  const { month, from, to } = req.query

  if (typeof month === 'string') {
    if (!isIsoMonth(month)) throw badRequest('month must be in the format YYYY-MM, e.g. 2026-04')
    return monthRange(month)
  }

  if (typeof from === 'string' && typeof to === 'string') {
    if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('from and to must be YYYY-MM-DD')
    if (to < from) throw badRequest('The end of the period cannot be before its start.')
    return { from, to }
  }

  // Default to the month just gone, which is what a committee usually wants.
  const today = todayInIndia()
  const previous = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
  previous.setUTCMonth(previous.getUTCMonth() - 1)
  return monthRange(previous.toISOString().slice(0, 7))
}

reportsRouter.get('/period', async (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

  res.json(await finance.report(resolvePeriod(req), `${actor.name} (${actor.role})`))
})

/**
 * Which statement was asked for. Anything unrecognised is the detailed one, because
 * a stale link should give more than was expected rather than less.
 */
function resolveDetail(req: Request): ReportDetail {
  return req.query.detail === 'summary' ? 'summary' : 'detailed'
}

/**
 * A filename somebody can find again in six months.
 *
 * `statement-2026-04-01-to-2026-04-30.pdf` was ambiguous in the way that matters: two
 * downloads of the same period, one before a correction and one after, arrived as
 * `statement(1).pdf` in a downloads folder with nothing to tell them apart, and
 * neither said which of the two reports it was.
 *
 * So the name carries the club, which report, the period it covers, and the day it
 * was issued:
 *
 *   Milani-Sangha-Club-summary-2026-04-2026-08-05.pdf
 *   Milani-Sangha-Club-detailed-2026-04-01-to-2026-04-30-issued-2026-08-05.pdf
 *
 * A period that is exactly one calendar month is named as that month, because that
 * is how a committee refers to it.
 */
export function statementFilename(input: {
  clubName: string
  detail: ReportDetail
  from: string
  to: string
  issuedOn: string
}): string {
  const slug = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')

  const wholeMonth =
    input.from.slice(0, 7) === input.to.slice(0, 7) &&
    input.from.endsWith('-01') &&
    input.to === lastDayOfMonth(input.to)

  const period = wholeMonth ? input.from.slice(0, 7) : `${input.from}-to-${input.to}`

  return `${slug(input.clubName)}-${input.detail}-${period}-issued-${input.issuedOn}.pdf`
}

reportsRouter.get('/period.pdf', async (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

  const period = resolvePeriod(req)
  const detail = resolveDetail(req)

  const report = await finance.report(period, `${actor.name} (${actor.role})`)
  const pdf = await renderFinanceReportPdf(report, { detail })

  const filename = statementFilename({
    clubName: report.club.name,
    detail,
    from: period.from,
    to: period.to,
    issuedOn: todayInIndia(),
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // A financial statement must never be served from a cache: the figures change
  // as entries are recorded.
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Length', String(pdf.byteLength))

  res.end(Buffer.from(pdf))
})
