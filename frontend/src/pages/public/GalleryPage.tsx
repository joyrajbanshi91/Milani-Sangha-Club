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
import { formatDateLong } from '@/lib/format'

export function GalleryPage() {
  const albums = [...gallery].sort((a, b) => b.date.localeCompare(a.date))
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const current = openIndex === null ? null : albums[openIndex]

  // Wrap around at both ends, so the arrows never dead-end.
  const step = (delta: number) => {
    if (openIndex === null || albums.length === 0) return
    setOpenIndex((openIndex + delta + albums.length) % albums.length)
  }

  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="Moments from the club"
        lead="Photographs and video from events, fixtures and service work, arranged by occasion."
      />

      <Section>
        {albums.length > 0 ? (
          <>
            <Reveal mode="stagger" as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((album, index) => (
                <li key={album.slug}>
                  <AlbumCard album={album} onOpen={() => setOpenIndex(index)} />
                </li>
              ))}
            </Reveal>

            <p className="mt-10 rounded-card border border-brand-200 bg-brand-50/70 p-4 text-sm/relaxed text-brand-900">
              Album covers are placeholders. Once the gallery module is in place, the committee
              uploads photographs and video through the admin portal and they appear here
              automatically — with full-size viewing, search and filters.
            </p>
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
        open={current !== null}
        onClose={() => setOpenIndex(null)}
        onPrevious={albums.length > 1 ? () => step(-1) : undefined}
        onNext={albums.length > 1 ? () => step(1) : undefined}
        title={current?.title ?? ''}
        caption={
          current
            ? `${current.description} — ${formatDateLong(current.date)}. Photographs from this album will appear here once they are uploaded.`
            : undefined
        }
        counter={
          openIndex !== null && albums.length > 0
            ? `Album ${openIndex + 1} of ${albums.length}`
            : undefined
        }
      >
        {current ? (
          <PlaceholderImage
            label={current.title}
            shape="wide"
            className="w-full rounded-none"
            showMonogram
          />
        ) : null}
      </Lightbox>
    </>
  )
}
