import { Container } from '@/components/ui/Container'

interface PageHeroProps {
  eyebrow?: string
  title: string
  lead?: string
}

/**
 * Banner at the top of every inner page.
 *
 * Holds the page's `h1`, so sections below it start at `h2` and the heading
 * outline stays correct for screen readers.
 */
export function PageHero({ eyebrow, title, lead }: PageHeroProps) {
  return (
    <div className="bg-aurora relative overflow-hidden">
      {/* Slow-drifting colour blobs. Purely decorative, and stilled entirely
          under prefers-reduced-motion by the global rule in index.css. */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-float-slow rounded-full bg-brand-300/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 top-8 h-64 w-64 animate-float-slower rounded-full bg-accent-200/50 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="texture-grid pointer-events-none absolute inset-0 text-brand-900/[0.04]"
        aria-hidden="true"
      />

      <Container className="relative py-16 sm:py-20">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="inline-flex items-center rounded-full border border-brand-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 backdrop-blur-sm">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-5 font-display text-3xl tracking-tight text-ink-900 sm:text-5xl">
            {title}
          </h1>
          {lead ? <p className="mt-5 max-w-2xl text-lg/relaxed text-ink-600">{lead}</p> : null}
        </div>
      </Container>

      {/* Soft transition into the white page body. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white"
        aria-hidden="true"
      />
    </div>
  )
}
