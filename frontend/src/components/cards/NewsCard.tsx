import { Pin } from 'lucide-react'

import type { NewsItem } from '@/content/site'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { hueFor } from '@/lib/hues'

export function NewsCard({ item, className }: { item: NewsItem; className?: string }) {
  const hue = hueFor(item.category)

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-card border bg-white p-5 shadow-soft',
        'transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        item.pinned ? hue.border : 'border-ink-200',
        className
      )}
    >
      {/* Soft colour wash that grows on hover. */}
      <span
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
          hue.bar
        )}
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            hue.chip
          )}
        >
          {item.category}
        </span>
        {item.pinned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-700">
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </span>
        ) : null}
        <time dateTime={item.date} className="ml-auto text-xs text-ink-500">
          {formatDate(item.date)}
        </time>
      </div>

      <h3 className="relative mt-3 font-display text-lg leading-snug text-ink-900">{item.title}</h3>
      <p className="relative mt-2 text-sm/relaxed text-ink-600">{item.summary}</p>
    </article>
  )
}
