import { Check } from 'lucide-react'

import { PageHero } from '@/components/layout/PageHero'
import { LinkButton } from '@/components/ui/LinkButton'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { about, club } from '@/content/site'
import { cn } from '@/lib/cn'
import { hueByIndex } from '@/lib/hues'

export function AboutPage() {
  return (
    <>
      <PageHero eyebrow={about.eyebrow} title={about.title} lead={about.lead} />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <Reveal className="space-y-5 text-[17px]/relaxed text-ink-600">
            {about.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}

            <div className="flex flex-wrap gap-3 pt-4">
              <LinkButton to="/committee">Meet the committee</LinkButton>
              <LinkButton to="/documents" variant="secondary">
                Read the constitution
              </LinkButton>
            </div>
          </Reveal>

          <Reveal as="aside" className="space-y-6">
            {/*
              The club's own photograph once site.ts names one, the monogram tile until
              then — the same size either way, so the column keeps its shape.
            */}
            <Photo
              picture={about.picture}
              shape="wide"
              className="w-full shadow-lift ring-8 ring-brand-50"
            />
            <div className="rounded-card border border-brand-200 bg-brand-50/60 p-6">
              <h2 className="font-display text-lg text-ink-900">In brief</h2>
              <p className="mt-3 text-sm/relaxed text-ink-600">{club.summary}</p>
              <dl className="mt-5 space-y-3 border-t border-brand-200/70 pt-5 text-sm">
                {club.establishedYear ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Established</dt>
                    <dd className="font-medium text-ink-900">{club.establishedYear}</dd>
                  </div>
                ) : null}
                {club.registrationNumber ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Registration</dt>
                    <dd className="font-medium text-ink-900">{club.registrationNumber}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Location</dt>
                  <dd className="text-right font-medium text-ink-900">
                    {club.contact.city}
                    {club.contact.state ? `, ${club.contact.state}` : ''}
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section tone="auroraSoft">
        <Reveal>
          <SectionHeading eyebrow="What we stand for" title="How the club runs" align="centre" />
        </Reveal>

        <Reveal mode="stagger" as="ul" className="mt-12 grid gap-5 sm:grid-cols-2">
          {about.values.map((value, index) => {
            const hue = hueByIndex(index)
            return (
              <li
                key={value.title}
                className={cn(
                  'group flex gap-4 rounded-card border bg-white/85 p-6 shadow-soft backdrop-blur-sm',
                  'transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
                  hue.border
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
                    hue.tile
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-lg text-ink-900">{value.title}</h3>
                  <p className="mt-1.5 text-sm/relaxed text-ink-600">{value.body}</p>
                </div>
              </li>
            )
          })}
        </Reveal>
      </Section>
    </>
  )
}
