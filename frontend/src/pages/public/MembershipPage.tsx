import { Check, Info } from 'lucide-react'

import { PageHero } from '@/components/layout/PageHero'
import { LinkButton } from '@/components/ui/LinkButton'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { membership } from '@/content/site'
import { cn } from '@/lib/cn'
import { formatRupees } from '@/lib/format'
import { hueByIndex, hueFor } from '@/lib/hues'

export function MembershipPage() {
  return (
    <>
      <PageHero eyebrow={membership.eyebrow} title={membership.title} lead={membership.lead} />

      {/* Benefits --------------------------------------------------------- */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              eyebrow="Why join"
              title="What membership gives you"
              lead="Members shape the club’s direction and have first call on everything it organises."
            />
          </Reveal>

          <Reveal mode="stagger" as="ul" className="space-y-3">
            {membership.benefits.map((benefit, index) => {
              const hue = hueByIndex(index)
              return (
                <li
                  key={benefit}
                  className={cn(
                    'group flex gap-3 rounded-xl border bg-white p-4 shadow-soft transition-all duration-300 hover:translate-x-1 hover:shadow-lift',
                    hue.border
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110',
                      hue.tile
                    )}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="self-center text-sm/relaxed text-ink-700">{benefit}</span>
                </li>
              )
            })}
          </Reveal>
        </div>
      </Section>

      {/* Categories ------------------------------------------------------- */}
      <Section tone="auroraSoft">
        <Reveal>
          <SectionHeading
            eyebrow="Categories"
            title="Membership types and fees"
            lead="Choose the category you are eligible for when you apply. The committee confirms it during review."
          />
        </Reveal>

        <Reveal mode="stagger" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {membership.types.map((type) => {
            const hue = hueFor(type.name)
            return (
              <article
                key={type.key}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded-card border bg-white p-6 shadow-soft',
                  'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
                  type.highlight ? 'border-brand-400 ring-2 ring-brand-200' : hue.border
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity duration-500 group-hover:opacity-50',
                    hue.bar
                  )}
                  aria-hidden="true"
                />

                {type.highlight ? (
                  <span className="absolute right-4 top-4 inline-flex items-center rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Most common
                  </span>
                ) : null}

                <h3 className="relative font-display text-xl text-ink-900">{type.name}</h3>

                <div className="relative mt-3">
                  {type.fee === null ? (
                    <>
                      <p className="text-sm font-medium text-ink-400">To be confirmed</p>
                      <p className="mt-0.5 text-xs text-ink-400">{type.period}</p>
                    </>
                  ) : (
                    <p className="flex items-baseline gap-1.5">
                      <span className="font-display text-3xl text-ink-900">
                        {formatRupees(type.fee)}
                      </span>
                      <span className="text-xs text-ink-500">{type.period}</span>
                    </p>
                  )}
                </div>

                <p className="relative mt-4 flex-1 text-sm/relaxed text-ink-600">
                  {type.eligibility}
                </p>
              </article>
            )
          })}
        </Reveal>

        {membership.feeNote ? (
          <Reveal>
            <p className="mt-8 flex items-start gap-2.5 rounded-card border border-accent-200 bg-accent-50/80 p-4 text-sm/relaxed text-accent-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {membership.feeNote}
            </p>
          </Reveal>
        ) : null}
      </Section>

      {/* How to join ------------------------------------------------------ */}
      <Section>
        <Reveal>
          <SectionHeading
            eyebrow="The process"
            title="How to join, step by step"
            lead="Payments are verified by the treasurer against the club’s bank records. A receipt is issued only after that check — never before."
            align="centre"
          />
        </Reveal>

        <Reveal mode="stagger" as="ol" className="mt-12 grid gap-6 md:grid-cols-5">
          {membership.steps.map((step, index) => {
            const hue = hueByIndex(index)
            return (
              <li key={step.title} className="group relative">
                <span
                  className={cn(
                    'inline-flex h-12 w-12 items-center justify-center rounded-2xl font-display text-lg font-semibold transition-transform duration-300 group-hover:scale-110',
                    hue.tile
                  )}
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-base text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-sm/relaxed text-ink-600">{step.body}</p>
              </li>
            )
          })}
        </Reveal>

        <Reveal>
          <div className="bg-shine relative mt-14 overflow-hidden rounded-card px-8 py-12 text-center">
            <div
              className="texture-dots pointer-events-none absolute inset-0 text-white/15"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-20 left-1/2 h-56 w-80 -translate-x-1/2 animate-float-slow rounded-full bg-accent-400/25 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="font-display text-2xl text-white sm:text-3xl">Ready to apply?</h2>
              <p className="mx-auto mt-3 max-w-xl text-brand-50">
                The online application form opens when the member portal goes live. Until then,
                please write to the club office and the secretary will send you a form.
              </p>
              <LinkButton to="/contact" variant="onDark" className="mt-6" size="lg">
                Request an application form
              </LinkButton>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  )
}
