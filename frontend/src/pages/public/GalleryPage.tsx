import { Images } from 'lucide-react'
import { useState } from 'react'

import { AlbumCard } from '@/components/cards/AlbumCard'
import { PageHero } from '@/components/layout/PageHero'
import { EmptyState } from '@/components/ui/EmptyState'
import { Lightbox } from '@/components/ui/Lightbox'
import { PlaceholderImage } from '@/components/ui/PlaceholderImage'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { gallery } from '@/content/site'
import { describe, photosFor } from '@/features/gallery/photos'
import { formatDateLong } from '@/lib/format'

/**
 * The gallery.
 *
 * Albums are declared in `site.ts` — title, date, description — and their photographs
 * are found in `src/assets/gallery/<slug>/` by looking in the folder. Adding a
 * photograph is copying a file into the right folder; there is no list to keep in step.
 *
 * ## Opening an album opens its photographs
 *
 * The viewer used to step between *albums*, one placeholder each, because there were no
 * photographs to step through. It now walks the photographs inside the album that was
 * opened, which is what a visitor expects of a gallery — and the arrows wrap, so they
 * never dead-end.
 *
 * An album whose folder is still empty keeps its coloured placeholder and says so. That
 * matters more than it looks: a club fills a gallery one event at a time, and a
 * half-filled gallery must not look broken.
 */
export function GalleryPage() {
  const albums = [...gallery].sort((a, b) => b.date.localeCompare(a.date))

  /** Which album is open, and which of its photographs. */
  const [viewing, setViewing] = useState<{ album: number; photo: number } | null>(null)

  const album = viewing === null ? null : (albums[viewing.album] ?? null)
  const photos = album ? photosFor(album.slug) : []
  const photo = viewing === null ? null : (photos[viewing.photo] ?? null)

  /** Wrap around at both ends, so the arrows never dead-end. */
  const step = (delta: number) => {
    if (viewing === null || photos.length === 0) return
    setViewing({
      album: viewing.album,
      photo: (viewing.photo + delta + photos.length) % photos.length,
    })
  }

  const anyPhotographs = albums.some((entry) => photosFor(entry.slug).length > 0)

  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="Moments from the club"
        lead="Photographs from events, fixtures and service work, arranged by occasion."
      />

      <Section>
        {albums.length > 0 ? (
          <>
            <Reveal mode="stagger" as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((entry, index) => (
                <li key={entry.slug}>
                  <AlbumCard
                    album={entry}
                    photos={photosFor(entry.slug)}
                    onOpen={() => setViewing({ album: index, photo: 0 })}
                  />
                </li>
              ))}
            </Reveal>

            {/*
              The note only appears while there is genuinely nothing to see. It used to
              be permanent, and a permanent apology on a page full of photographs is
              worse than none at all.
            */}
            {!anyPhotographs ? (
              <p className="mt-10 rounded-card border border-brand-200 bg-brand-50/70 p-4 text-sm/relaxed text-brand-900">
                Photographs are being collected for these albums and will appear here as they
                arrive.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={Images}
            title="The gallery is being put together"
            body="Photographs from recent events will be published here shortly."
          />
        )}
      </Section>

      <Lightbox
        open={viewing !== null}
        onClose={() => setViewing(null)}
        onPrevious={photos.length > 1 ? () => step(-1) : undefined}
        onNext={photos.length > 1 ? () => step(1) : undefined}
        title={album?.title ?? ''}
        caption={
          album
            ? photos.length > 0
              ? `${describe(photos[viewing?.photo ?? 0] ?? photos[0]!) || album.description} — ${formatDateLong(album.date)}`
              : `${album.description} — ${formatDateLong(album.date)}. Photographs from this album have not been added yet.`
            : undefined
        }
        counter={
          photos.length > 0 && viewing !== null
            ? `${viewing.photo + 1} of ${photos.length}`
            : undefined
        }
      >
        {photo && album ? (
          <img
            src={photo.src}
            alt={describe(photo) || album.title}
            className="max-h-[75vh] w-full bg-ink-900 object-contain"
          />
        ) : album ? (
          <PlaceholderImage label={album.title} shape="wide" className="w-full rounded-none" />
        ) : null}
      </Lightbox>
    </>
  )
}
