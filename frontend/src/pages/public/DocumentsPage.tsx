import { Download, FileText, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHero } from '@/components/layout/PageHero'
import { EmptyState } from '@/components/ui/EmptyState'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { documents } from '@/content/site'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { hueFor } from '@/lib/hues'

const ALL = 'All'

export function DocumentsPage() {
  const [category, setCategory] = useState<string>(ALL)

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(documents.map((item) => item.category))).sort()],
    []
  )

  const visible = useMemo(() => {
    const sorted = [...documents].sort((a, b) => b.updated.localeCompare(a.updated))
    return category === ALL ? sorted : sorted.filter((item) => item.category === category)
  }, [category])

  return (
    <>
      <PageHero
        eyebrow="Documents"
        title="Constitution, minutes and reports"
        lead="The club’s governing documents and published records. Members can access the full archive in the portal."
      />

      <Section>
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

        {visible.length > 0 ? (
          <Reveal
            mode="stagger"
            as="ul"
            className="mt-8 divide-y divide-ink-200 overflow-hidden rounded-card border border-ink-200 bg-white shadow-soft"
          >
            {visible.map((document) => {
              const hue = hueFor(document.category)
              return (
                <li
                  key={document.title}
                  className="group flex flex-col gap-3 p-5 transition-colors duration-300 hover:bg-ink-50/70 sm:flex-row sm:items-center sm:gap-5"
                >
                  <span
                    className={cn(
                      'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
                      hue.tile
                    )}
                  >
                    <FileText className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{document.title}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 font-medium',
                          hue.chip
                        )}
                      >
                        {document.category}
                      </span>
                      <span>
                        Updated{' '}
                        <time dateTime={document.updated}>{formatDate(document.updated)}</time>
                      </span>
                    </p>
                  </div>

                  {document.href ? (
                    <a
                      href={document.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-brand-500 px-4 text-sm font-medium text-white transition-transform duration-300 hover:scale-[1.03]"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </a>
                  ) : (
                    <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-dashed border-ink-300 px-4 text-sm text-ink-400">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Not yet uploaded
                    </span>
                  )}
                </li>
              )
            })}
          </Reveal>
        ) : (
          <EmptyState className="mt-8" icon={FileText} title="No documents in this category" />
        )}

        <p className="mt-8 rounded-lg border border-ink-200 bg-ink-50 p-4 text-sm/relaxed text-ink-600">
          Files are uploaded by the secretary through the admin portal once the documents module is
          in place. Until then the list shows what will be published, and each entry is marked as
          not yet uploaded rather than linking to a file that does not exist.
        </p>
      </Section>
    </>
  )
}
