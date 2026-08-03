import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

/**
 * Stand-in artwork used until real photographs are uploaded.
 *
 * Deliberately not a grey box: it derives a stable gradient from the label so
 * that each album, event or person keeps its own colour across reloads, which
 * makes an unfinished gallery still read as designed rather than as broken.
 *
 * Photographs replace this from the gallery phase onwards; nothing here fetches
 * from the network, so it also works offline.
 */
interface PlaceholderImageProps {
  /** Drives both the monogram and the hue. */
  label: string
  className?: string
  shape?: 'square' | 'wide' | 'portrait' | 'circle'
  showMonogram?: boolean
}

const SHAPES = {
  square: 'aspect-square',
  wide: 'aspect-16/10',
  portrait: 'aspect-4/5',
  circle: 'aspect-square rounded-full',
}

/** Stable hash so a given label always yields the same hue. */
function hueFor(label: string): number {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 360
  }
  // Constrained to greens through blues, so placeholders sit beside the brand
  // colour instead of fighting it.
  return 130 + (hash % 90)
}

export function PlaceholderImage({
  label,
  className,
  shape = 'wide',
  showMonogram = true,
}: PlaceholderImageProps) {
  const hue = hueFor(label)

  return (
    <div
      role="img"
      aria-label={`Placeholder image for ${label}`}
      className={cn(
        'relative isolate flex items-center justify-center overflow-hidden',
        SHAPES[shape],
        shape !== 'circle' && 'rounded-card',
        className
      )}
      style={{
        backgroundImage: `linear-gradient(135deg,
          hsl(${hue} 32% 24%) 0%,
          hsl(${hue + 18} 38% 34%) 55%,
          hsl(${hue + 34} 30% 46%) 100%)`,
      }}
    >
      <div className="texture-dots absolute inset-0 text-white/15" aria-hidden="true" />
      {showMonogram ? (
        <span
          className="relative font-display text-2xl font-semibold text-white/70 select-none"
          aria-hidden="true"
        >
          {initials(label)}
        </span>
      ) : null}
    </div>
  )
}
