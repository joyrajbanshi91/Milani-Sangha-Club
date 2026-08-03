import { Images, Maximize2 } from 'lucide-react'

import { PlaceholderImage } from '@/components/ui/PlaceholderImage'
import type { AlbumItem } from '@/content/site'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { hueFor } from '@/lib/hues'

interface AlbumCardProps {
  album: AlbumItem
  /** When given, the whole card becomes a button that opens the viewer. */
  onOpen?: () => void
}

export function AlbumCard({ album, onOpen }: AlbumCardProps) {
  const hue = hueFor(album.title)

  const body = (
    <>
      <div className="relative overflow-hidden">
        <PlaceholderImage
          label={album.title}
          shape="wide"
          className="rounded-none transition-transform duration-700 ease-out-soft group-hover:scale-110"
        />
        {/* Darkening veil plus an expand hint, so it is obvious the card opens. */}
        <span
          className="absolute inset-0 bg-gradient-to-t from-ink-900/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        />
        {onOpen ? (
          <span
            className="absolute bottom-3 right-3 inline-flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-white/95 text-ink-800 opacity-0 shadow-lift transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
            aria-hidden="true"
          >
            <Maximize2 className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div className="p-5">
        <h3 className="font-display text-lg leading-snug text-ink-900">{album.title}</h3>
        <p className="mt-1.5 text-sm/relaxed text-ink-600">{album.description}</p>

        <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
          <time dateTime={album.date}>{formatDate(album.date)}</time>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium',
              hue.chip
            )}
          >
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            {album.itemCount > 0 ? `${album.itemCount} items` : 'Photographs to follow'}
          </span>
        </div>
      </div>
    </>
  )

  const shell = cn(
    'group block w-full overflow-hidden rounded-card border bg-white text-left shadow-soft',
    'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
    hue.border
  )

  if (!onOpen) {
    return <article className={shell}>{body}</article>
  }

  return (
    <button type="button" onClick={onOpen} className={shell}>
      {body}
      <span className="sr-only">Open album</span>
    </button>
  )
}
