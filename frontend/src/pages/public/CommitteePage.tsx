import { Mail } from 'lucide-react'

import { PageHero } from '@/components/layout/PageHero'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/LinkButton'
import { PlaceholderImage } from '@/components/ui/PlaceholderImage'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { club, committee } from '@/content/site'
import { cn } from '@/lib/cn'
import { hueByIndex } from '@/lib/hues'

export function CommitteePage() {
  return (
    <>
      <PageHero eyebrow={committee.eyebrow} title={committee.title} lead={committee.lead} />

      <Section>
        {committee.term ? (
          <span className="mb-8 inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
            Term {committee.term}
          </span>
        ) : null}

        {committee.members.length > 0 ? (
          <Reveal mode="stagger" as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {committee.members.map((member, index) => {
              const hue = hueByIndex(index)
              return (
                <li
                  key={`${member.role}-${index}`}
                  className={cn(
                    'group overflow-hidden rounded-card border bg-white shadow-soft',
                    'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
                    hue.border
                  )}
                >
                  <div className="relative overflow-hidden">
                    {/*
                      A photograph when the club has supplied one, the monogram until
                      then. `alt` is empty on purpose: the name is the heading directly
                      below, and a screen reader announcing "photograph of Anita Sharma"
                      followed by "Anita Sharma" reads the same person twice.

                      object-cover with the placeholder's own 4:5 crop, so a portrait and
                      a monogram card are exactly the same size and the grid does not
                      jump as photographs are added one at a time.
                    */}
                    {member.photo ? (
                      <img
                        src={member.photo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-4/5 w-full object-cover transition-transform duration-700 ease-out-soft group-hover:scale-105"
                      />
                    ) : (
                      <PlaceholderImage
                        label={member.name}
                        shape="portrait"
                        className="rounded-none transition-transform duration-700 ease-out-soft group-hover:scale-105"
                      />
                    )}
                    <span
                      className={cn('absolute inset-x-0 bottom-0 h-1', hue.bar)}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="p-5">
                    <p
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em]',
                        hue.chip
                      )}
                    >
                      {member.role}
                    </p>
                    <h2 className="mt-3 font-display text-lg text-ink-900">{member.name}</h2>
                    {member.since ? (
                      <p className="mt-1 text-sm text-ink-500">In office since {member.since}</p>
                    ) : null}

                    {member.email ? (
                      <a
                        href={`mailto:${member.email}`}
                        className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{member.email}</span>
                      </a>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </Reveal>
        ) : (
          <EmptyState
            title="The committee list is being updated"
            body="Office bearers will be listed here after the next election."
          />
        )}
      </Section>

      <Section tone="auroraSoft" size="sm">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl text-ink-900">Contacting an office bearer</h2>
          {/*
            Two truths, and the page must not tell the wrong one. Asking visitors to
            write to the office while printing six addresses beside it reads as though
            nobody checked the page; so this follows whether the club has actually
            published any.
          */}
          <p className="mt-3 text-ink-600">
            {committee.members.some((member) => member.email)
              ? 'Write to the bearer whose office your enquiry concerns, or to the club office if you are not sure — either way it reaches the committee.'
              : 'Please write to the club office rather than to members directly, so that your enquiry is recorded and answered by whoever is best placed to help.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton to="/contact">Contact the club</LinkButton>
            {club.contact.email ? (
              <LinkButton to={`mailto:${club.contact.email}`} variant="secondary" external>
                <Mail className="h-4 w-4" aria-hidden="true" />
                {club.contact.email}
              </LinkButton>
            ) : null}
          </div>
        </Reveal>
      </Section>
    </>
  )
}
