import { PageHero } from '@/components/layout/PageHero'
import { LinkButton } from '@/components/ui/LinkButton'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { history } from '@/content/site'
import { cn } from '@/lib/cn'
import { hueByIndex } from '@/lib/hues'

export function HistoryPage() {
  return (
    <>
      <PageHero eyebrow={history.eyebrow} title={history.title} lead={history.lead} />

      <Section>
        <ol className="relative mx-auto max-w-3xl">
          {/* The spine, tinted along its length. */}
          <div
            className="absolute left-[19px] top-3 bottom-10 w-0.5 rounded-full bg-gradient-to-b from-brand-300 via-accent-300 to-sky-300 sm:left-[23px]"
            aria-hidden="true"
          />

          {history.milestones.map((milestone, index) => {
            const hue = hueByIndex(index)
            return (
              <Reveal
                key={`${milestone.year}-${index}`}
                as="li"
                className="relative flex gap-6 pb-12 last:pb-0"
              >
                <span
                  className={cn(
                    'relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-soft sm:h-12 sm:w-12',
                    hue.tile
                  )}
                  aria-hidden="true"
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', hue.bar)} />
                </span>

                <div className="min-w-0 pt-1.5">
                  <p
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.14em]',
                      hue.chip
                    )}
                  >
                    {milestone.year}
                  </p>
                  <h2 className="mt-3 font-display text-xl text-ink-900 sm:text-2xl">
                    {milestone.title}
                  </h2>
                  <p className="mt-2 text-[17px]/relaxed text-ink-600">{milestone.body}</p>
                </div>
              </Reveal>
            )
          })}
        </ol>
      </Section>

      <Section tone="auroraSoft" size="sm">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl text-ink-900">Can you fill a gap?</h2>
          <p className="mt-3 text-ink-600">
            If you hold photographs, minute books or programmes from the club’s earlier years, the
            committee would be glad to copy them for the archive.
          </p>
          <LinkButton to="/contact" className="mt-6">
            Get in touch
          </LinkButton>
        </Reveal>
      </Section>
    </>
  )
}
