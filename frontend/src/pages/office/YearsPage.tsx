import { Container } from '@/components/ui/Container'
import { FinancialYears } from '@/features/finance/YearEnd'

/**
 * Club years.
 *
 * A page of its own rather than a panel at the foot of the statements page, where the
 * club could not find it — and where, for eleven months of every twelve, all it said was
 * that there was nothing to do. This is the answer to two questions an office bearer
 * asks out loud: *where do I start the new year with its opening balance*, and *where did
 * last year's figures go*.
 */
export function YearsPage() {
  return (
    <Container className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Club years</h1>
        <p className="mt-1 max-w-3xl text-sm/relaxed text-ink-500">
          The club's accounts run April to March, and each year stands on its own: the balance
          the committee declared it started with, plus that year's entries. Starting a year
          closes the one before — its figures are settled and nothing can be dated back into it,
          but every office bearer can still read it here or on the dashboard, for good.
        </p>
      </div>

      <FinancialYears />
    </Container>
  )
}
