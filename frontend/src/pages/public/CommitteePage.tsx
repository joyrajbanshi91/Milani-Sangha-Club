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

        {/*
          Four across on a wide screen rather than three.

          The committee has eight offices, and a portrait card that filled its own column
          made a page nobody scrolled to the end of. A circular photograph and a name is a
          compact thing, so eight of them sit as two tidy rows.
        */}
        {committee.members.length > 0 ? (
          <Reveal mode="stagger" as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {committee.members.map((member, index) => {
              const hue = hueByIndex(index)
              return (
                <li
                  key={`${member.role}-${index}`}
                  className={cn(
                    'group flex flex-col items-center rounded-card border bg-white p-6 text-center shadow-soft',
                    'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
                    hue.border
                  )}
                >
                  {/*
                    A round photograph, in a ring of the card's own hue.

                    The ring is a padded circle behind the image rather than a border on
                    it, so the coloured edge cannot crop a pixel of anybody's face — and
                    it replaces the accent bar the square card used to carry along its
                    bottom edge, which had nowhere to sit once the photograph was round.
                  */}
                  <div
                    className={cn(
                      'rounded-full p-[3px] transition-transform duration-500 ease-out-soft group-hover:scale-105',
                      hue.bar
                    )}
                  >
                    {/*
                      A photograph when the club has supplied one, the monogram until
                      then, at identical size — so the grid keeps its shape as
                      photographs arrive one at a time.

                      `alt` is empty on purpose: the name is the heading directly below,
                      and a screen reader announcing "photograph of Anita Sharma"
                      followed by "Anita Sharma" reads the same person twice.
                      `object-cover` crops from the centre, which is why the editing
                      note asks for a square file with the face in the middle.
                    */}
                    {member.photo ? (
                      <img
                        src={member.photo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-28 w-28 rounded-full object-cover ring-2 ring-white sm:h-32 sm:w-32"
                      />
                    ) : (
                      <PlaceholderImage
                        label={member.name}
                        shape="circle"
                        className="h-28 w-28 ring-2 ring-white sm:h-32 sm:w-32"
                      />
                    )}
                  </div>

                  <p
                    className={cn(
                      'mt-5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em]',
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
