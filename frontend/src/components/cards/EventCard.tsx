import { Clock, MapPin } from 'lucide-react'

import type { EventItem } from '@/content/site'
import { cn } from '@/lib/cn'
import { formatDateChip, isUpcoming } from '@/lib/format'
import { hueFor } from '@/lib/hues'

export function EventCard({ event, className }: { event: EventItem; className?: string }) {
  const chip = formatDateChip(event.date)
  const upcoming = isUpcoming(event.date)
  const hue = hueFor(event.category)

  return (
    <article
      className={cn(
        'group relative flex gap-5 overflow-hidden rounded-card border bg-white p-5',
        'shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        upcoming ? hue.border : 'border-ink-200',
        className
      )}
    >
      {/* Colour bar keyed to the category, revealed on hover. */}
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1 origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100',
          hue.bar
        )}
        aria-hidden="true"
      />

      <div
        className={cn(
          'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-center transition-transform duration-300 group-hover:scale-105',
          upcoming ? hue.tile : 'bg-ink-100 text-ink-500'
        )}
      >
        <span className="font-display text-xl font-semibold leading-none">{chip.day}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
          {chip.month} {chip.year}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              hue.chip
            )}
          >
            {event.category}
          </span>
          {!upcoming ? (
            <span className="inline-flex items-center rounded-full border border-ink-200 px-2.5 py-0.5 text-xs text-ink-500">
              Past
            </span>
          ) : null}
        </div>

        <h3 className="mt-2 font-display text-lg leading-snug text-ink-900">{event.title}</h3>
        <p className="mt-1.5 text-sm/relaxed text-ink-600">{event.summary}</p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Time</dt>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <dd>{event.time}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Venue</dt>
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <dd>{event.venue}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}
