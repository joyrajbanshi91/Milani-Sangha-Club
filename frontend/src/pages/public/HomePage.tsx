import { ArrowRight, Quote, Sparkles } from 'lucide-react'

import { AlbumCard } from '@/components/cards/AlbumCard'
import { EventCard } from '@/components/cards/EventCard'
import { NewsCard } from '@/components/cards/NewsCard'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Container } from '@/components/ui/Container'
import { EmptyState } from '@/components/ui/EmptyState'
import { iconByName } from '@/components/ui/Icon'
import { LinkButton } from '@/components/ui/LinkButton'
import { Marquee } from '@/components/ui/Marquee'
import { PlaceholderImage } from '@/components/ui/PlaceholderImage'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { events, gallery, home, news, sponsors, testimonials } from '@/content/site'
import { photosFor } from '@/features/gallery/photos'
import { cn } from '@/lib/cn'
import { isUpcoming } from '@/lib/format'
import { hueByIndex } from '@/lib/hues'

export function HomePage() {
  const upcoming = events.filter((event) => isUpcoming(event.date)).slice(0, 3)
  const latestNews = [...news]
    .sort(
      (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.date.localeCompare(a.date)
    )
    .slice(0, 3)
  /**
   * Four albums, the ones with photographs first.
   *
   * The home page is a shop window: it should lead with pictures the club has actually
   * taken, not with four coloured placeholders for events nobody has photographed yet.
   * Within each group the newest comes first, which is the order the gallery page uses.
   */
  const albums = [...gallery]
    .map((album) => ({ album, photos: photosFor(album.slug) }))
    .sort(
      (a, b) =>
        Number(b.photos.length > 0) - Number(a.photos.length > 0) ||
        b.album.date.localeCompare(a.album.date)
    )
    .slice(0, 4)

  return (
    <>
      <Hero />
      <Pillars />

      {/* Events ------------------------------------------------------------ */}
      <Section tone="tint">
        <SectionRow
          eyebrow={home.sections.events.eyebrow}
          title={home.sections.events.title}
          lead={home.sections.events.lead}
          cta={home.sections.events.cta}
        />
        {upcoming.length > 0 ? (
          <Reveal mode="stagger" className="mt-10 grid gap-5 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.slug} event={event} />
            ))}
          </Reveal>
        ) : (
          <EmptyState
            className="mt-10"
            title="Nothing in the diary just yet"
            body="The next fixtures and gatherings will appear here as soon as the committee publishes them."
          />
        )}
      </Section>

      {/* News -------------------------------------------------------------- */}
      <Section>
        <SectionRow
          eyebrow={home.sections.news.eyebrow}
          title={home.sections.news.title}
          lead={home.sections.news.lead}
          cta={home.sections.news.cta}
        />
        {latestNews.length > 0 ? (
          <Reveal mode="stagger" className="mt-10 grid gap-5 lg:grid-cols-3">
            {latestNews.map((item) => (
              <NewsCard key={item.slug} item={item} />
            ))}
          </Reveal>
        ) : (
          <EmptyState className="mt-10" title="No notices at the moment" />
        )}
      </Section>

      {/* Gallery ----------------------------------------------------------- */}
      <Section tone="tint">
        <SectionRow
          eyebrow={home.sections.gallery.eyebrow}
          title={home.sections.gallery.title}
          lead={home.sections.gallery.lead}
          cta={home.sections.gallery.cta}
        />
        {albums.length > 0 ? (
          <Reveal mode="stagger" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {albums.map(({ album, photos }) => (
              // `photos` is what makes the card show the club's own photograph rather
              // than a placeholder — the home page was not passing it.
              <AlbumCard key={album.slug} album={album} photos={photos} />
            ))}
          </Reveal>
        ) : (
          <EmptyState className="mt-10" title="The gallery is being put together" />
        )}
      </Section>

      <Testimonials />
      <Sponsors />
      <JoinCta />
    </>
  )
}

/** Heading with an optional "see all" link pushed to the right on wide screens. */
function SectionRow({
  eyebrow,
  title,
  lead,
  cta,
}: {
  eyebrow: string
  title: string
  lead: string
  cta?: { label: string; to: string }
}) {
  return (
    <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
      {cta ? (
        <LinkButton
          to={cta.to}
          variant="secondary"
          size="sm"
          className="group self-start sm:self-end"
        >
          {cta.label}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </LinkButton>
      ) : null}
    </Reveal>
  )
}

function Hero() {
  const { hero } = home

  // Highlight the final word of the headline in the brand gradient.
  const words = hero.title.trim().split(' ')
  const lastWord = words.length > 1 ? words.pop() : null
  const leadingWords = words.join(' ')

  return (
    <section className="bg-aurora relative overflow-hidden">
      <div
        className="pointer-events-none absolute -left-32 top-10 h-96 w-96 animate-float-slow rounded-full bg-brand-300/45 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 -top-16 h-80 w-80 animate-float-slower rounded-full bg-accent-200/60 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 animate-float-slow rounded-full bg-sky-200/50 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="texture-grid pointer-events-none absolute inset-0 text-brand-900/[0.05]"
        aria-hidden="true"
      />

      <Container className="relative py-20 sm:py-24 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 shadow-soft backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
              {hero.eyebrow}
            </p>

            <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
              {leadingWords}{' '}
              {lastWord ? <span className="text-gradient">{lastWord}</span> : null}
            </h1>

            <p className="mt-6 max-w-xl text-lg/relaxed text-ink-600">{hero.lead}</p>

            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton to={hero.primaryCta.to} size="lg" className="group shadow-glow">
                {hero.primaryCta.label}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </LinkButton>
              <LinkButton to={hero.secondaryCta.to} variant="secondary" size="lg">
                {hero.secondaryCta.label}
              </LinkButton>
            </div>

            {hero.stats.length > 0 ? (
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4">
                {hero.stats.map((stat, index) => {
                  const hue = hueByIndex(index)
                  return (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur-sm"
                    >
                      <span
                        className={cn('block h-1 w-8 rounded-full', hue.bar)}
                        aria-hidden="true"
                      />
                      <dd className="mt-3 font-display text-2xl text-ink-900 sm:text-3xl">
                        <AnimatedNumber value={stat.value} />
                      </dd>
                      <dt className="mt-1 text-xs uppercase tracking-wider text-ink-500">
                        {stat.label}
                      </dt>
                    </div>
                  )
                })}
              </dl>
            ) : null}
          </Reveal>

          {/*
            The collage. Each tile is the club's own photograph once `hero.collage`
            in site.ts names one, and a coloured monogram until then — the club
            supplies them one at a time, and a half-filled collage must still look
            arranged rather than broken.
          */}
          <Reveal className="relative hidden lg:block">
            <CollageTile
              picture={hero.collage.tall}
              shape="portrait"
              className="rotate-2 shadow-lift ring-8 ring-white/60 transition-transform duration-500 hover:rotate-0"
            />
            <CollageTile
              picture={hero.collage.bottomLeft}
              shape="square"
              className="absolute -bottom-8 -left-10 w-40 -rotate-6 shadow-lift ring-8 ring-white/70 transition-transform duration-500 hover:rotate-0"
            />
            <CollageTile
              picture={hero.collage.topRight}
              shape="square"
              className="absolute -right-6 -top-8 w-28 rotate-6 shadow-lift ring-8 ring-white/70 transition-transform duration-500 hover:rotate-0"
            />
          </Reveal>
        </div>
      </Container>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white"
        aria-hidden="true"
      />
    </section>
  )
}

/**
 * One tile of the hero collage.
 *
 * A photograph when the club has supplied one, the monogram tile until then, at the
 * same shape and angle either way — so adding the second picture does not shuffle the
 * other two. `object-cover` crops from the centre, which is why the editing note in
 * site.ts asks for the subject in the middle of the frame.
 *
 * No `loading="lazy"`: these sit at the top of the page, and a lazy hero photograph is
 * a blank space at the moment the visitor is looking straight at it.
 */
function CollageTile({
  picture,
  shape,
  className,
}: {
  picture: { image: string; label: string }
  shape: 'portrait' | 'square'
  className?: string
}) {
  if (!picture.image) {
    return <PlaceholderImage label={picture.label} shape={shape} className={className} />
  }

  return (
    <img
      src={picture.image}
      alt={picture.label}
      decoding="async"
      className={cn(
        'rounded-card object-cover',
        shape === 'portrait' ? 'aspect-4/5' : 'aspect-square',
        className
      )}
    />
  )
}

function Pillars() {
  const { intro } = home

  return (
    <Section>
      <Reveal>
        <SectionHeading
          eyebrow={intro.eyebrow}
          title={intro.title}
          lead={intro.lead}
          align="centre"
        />
      </Reveal>

      <Reveal mode="stagger" className="mt-12 grid gap-6 md:grid-cols-3">
        {intro.pillars.map((pillar, index) => {
          const Icon = iconByName(pillar.icon)
          const hue = hueByIndex(index)

          return (
            <div
              key={pillar.title}
              className={cn(
                'group relative overflow-hidden rounded-card border bg-white p-7 shadow-soft',
                'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
                hue.border
              )}
            >
              <span
                className={cn(
                  'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-70',
                  hue.bar
                )}
                aria-hidden="true"
              />

              <span
                className={cn(
                  'relative inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110',
                  hue.tile
                )}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>

              <h3 className="relative mt-5 font-display text-xl text-ink-900">{pillar.title}</h3>
              <p className="relative mt-2.5 text-sm/relaxed text-ink-600">{pillar.body}</p>
            </div>
          )
        })}
      </Reveal>
    </Section>
  )
}

function Testimonials() {
  if (testimonials.length === 0) return null
  const { testimonials: copy } = home.sections

  return (
    <Section tone="aurora" size="lg">
      <Reveal>
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} lead={copy.lead} align="centre" />
      </Reveal>

      <Reveal mode="stagger" as="ul" className="mt-12 grid gap-6 md:grid-cols-3">
        {testimonials.map((item, index) => {
          const hue = hueByIndex(index + 1)
          return (
            <li
              key={`${item.name}-${index}`}
              className="group rounded-card border border-white/80 bg-white/85 p-6 shadow-soft backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
            >
              <span
                className={cn(
                  'inline-flex h-10 w-10 items-center justify-center rounded-xl',
                  hue.tile
                )}
              >
                <Quote className="h-4 w-4" aria-hidden="true" />
              </span>
              <blockquote className="mt-4 text-sm/relaxed text-ink-700">{item.quote}</blockquote>
              <footer className="mt-5 border-t border-ink-200/70 pt-4">
                <p className="text-sm font-medium text-ink-900">{item.name}</p>
                <p className="text-xs text-ink-500">{item.role}</p>
              </footer>
            </li>
          )
        })}
      </Reveal>
    </Section>
  )
}

function Sponsors() {
  if (sponsors.length === 0) return null
  const { sponsors: copy } = home.sections

  return (
    <Section>
      <Reveal>
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} lead={copy.lead} align="centre" />
      </Reveal>

      <div className="mt-12">
        <Marquee>
          {sponsors.map((sponsor, index) => {
            const hue = hueByIndex(index)
            const inner = (
              <>
                <PlaceholderImage label={sponsor.name} shape="circle" className="h-12 w-12 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {sponsor.name}
                  </span>
                  <span className="block text-xs uppercase tracking-wider text-ink-400">
                    {sponsor.tier}
                  </span>
                </span>
              </>
            )

            const shell = cn(
              'flex w-64 items-center gap-4 rounded-card border bg-white p-4 shadow-soft transition-shadow duration-300 hover:shadow-lift',
              hue.border
            )

            return sponsor.url ? (
              <a
                key={`${sponsor.name}-${index}`}
                href={sponsor.url}
                target="_blank"
                rel="noreferrer noopener"
                className={shell}
              >
                {inner}
              </a>
            ) : (
              <div key={`${sponsor.name}-${index}`} className={shell}>
                {inner}
              </div>
            )
          })}
        </Marquee>
      </div>
    </Section>
  )
}

function JoinCta() {
  const { join } = home

  return (
    <Section tone="tint" size="lg">
      <Reveal>
        <div className="bg-shine relative overflow-hidden rounded-card px-8 py-14 text-center sm:px-14">
          <div
            className="texture-dots pointer-events-none absolute inset-0 text-white/15"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-96 -translate-x-1/2 animate-float-slow rounded-full bg-accent-400/25 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -top-20 -left-10 h-56 w-56 animate-float-slower rounded-full bg-brand-300/25 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-display text-3xl text-white sm:text-4xl">{join.title}</h2>
            <p className="mt-4 text-lg/relaxed text-brand-50">{join.lead}</p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <LinkButton to={join.primaryCta.to} variant="onDark" size="lg" className="group">
                {join.primaryCta.label}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </LinkButton>
              <LinkButton
                to={join.secondaryCta.to}
                size="lg"
                className="border border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              >
                {join.secondaryCta.label}
              </LinkButton>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
