import { Newspaper } from 'lucide-react'
import { useMemo, useState } from 'react'

import { NewsCard } from '@/components/cards/NewsCard'
import { PageHero } from '@/components/layout/PageHero'
import { EmptyState } from '@/components/ui/EmptyState'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { news } from '@/content/site'
import { cn } from '@/lib/cn'
import { hueFor } from '@/lib/hues'

const ALL = 'All'

export function NewsPage() {
  const [category, setCategory] = useState<string>(ALL)

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(news.map((item) => item.category))).sort()],
    []
  )

  const visible = useMemo(() => {
    const sorted = [...news].sort(
      (a, b) =>
        Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.date.localeCompare(a.date)
    )
    return category === ALL ? sorted : sorted.filter((item) => item.category === category)
  }, [category])

  return (
    <>
      <PageHero
        eyebrow="News & notices"
        title="From the notice board"
        lead="Announcements, circulars and decisions of the committee. Members also receive these by email and in the portal."
      />

      <Section>
        {categories.length > 2 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {categories.map((option) => {
              const hue = hueFor(option)
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-300',
                    category === option
                      ? cn(hue.chip, 'border-transparent shadow-soft')
                      : 'border-ink-200 bg-white text-ink-600 hover:-translate-y-0.5 hover:border-ink-300 hover:text-ink-900'
                  )}
                >
                  {option}
                </button>
              )
            })}
          </div>
        ) : null}

        {visible.length > 0 ? (
          <Reveal mode="stagger" className="mt-8 grid gap-5 lg:grid-cols-2">
            {visible.map((item) => (
              <NewsCard key={item.slug} item={item} />
            ))}
          </Reveal>
        ) : (
          <EmptyState
            className="mt-8"
            icon={Newspaper}
            title="No notices at the moment"
            body="Announcements from the committee will appear here."
          />
        )}
      </Section>
    </>
  )
}
