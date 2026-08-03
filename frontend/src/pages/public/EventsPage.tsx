import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EventCard } from '@/components/cards/EventCard'
import { PageHero } from '@/components/layout/PageHero'
import { EmptyState } from '@/components/ui/EmptyState'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { events } from '@/content/site'
import { cn } from '@/lib/cn'
import { isUpcoming } from '@/lib/format'

type Filter = 'upcoming' | 'past' | 'all'

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
]

export function EventsPage() {
  const [filter, setFilter] = useState<Filter>('upcoming')

  const { upcoming, past } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
    return {
      upcoming: sorted.filter((event) => isUpcoming(event.date)),
      // Most recent first for past events.
      past: sorted.filter((event) => !isUpcoming(event.date)).reverse(),
    }
  }, [])

  const visible = filter === 'upcoming' ? upcoming : filter === 'past' ? past : [...upcoming, ...past]

  return (
    <>
      <PageHero
        eyebrow="Events"
        title="What’s on at the club"
        lead="Fixtures, cultural evenings, meetings and service camps. Members can register through the portal once signed in."
      />

      <Section>
        <div
          role="group"
          aria-label="Filter events"
          className="inline-flex rounded-full border border-ink-200 bg-white p-1 shadow-soft"
        >
          {FILTERS.map((option) => {
            const count =
              option.key === 'upcoming'
                ? upcoming.length
                : option.key === 'past'
                  ? past.length
                  : events.length

            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={filter === option.key}
                onClick={() => setFilter(option.key)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-all duration-300',
                  filter === option.key
                    ? 'bg-gradient-to-r from-brand-700 to-brand-500 text-white shadow-glow'
                    : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                )}
              >
                {option.label}
                <span
                  className={cn(
                    'ml-1.5 text-xs',
                    filter === option.key ? 'text-brand-100' : 'text-ink-400'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {visible.length > 0 ? (
          <Reveal mode="stagger" className="mt-8 grid gap-5 lg:grid-cols-2">
            {visible.map((event) => (
              <EventCard key={event.slug} event={event} />
            ))}
          </Reveal>
        ) : (
          <EmptyState
            className="mt-8"
            icon={CalendarDays}
            title={
              filter === 'upcoming' ? 'Nothing in the diary just yet' : 'No events to show here'
            }
            body={
              filter === 'upcoming'
                ? 'The next fixtures and gatherings will appear here as soon as the committee publishes them.'
                : undefined
            }
          />
        )}
      </Section>
    </>
  )
}
