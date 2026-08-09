import { PlaceholderImage } from '@/components/ui/PlaceholderImage'
import { cn } from '@/lib/cn'

/**
 * One of the club's own photographs, or the monogram tile until it has one.
 *
 * The club supplies pictures one at a time, over months, so every place that shows one
 * has to look deliberate while it is still empty — and has to keep its exact size and
 * shape when the photograph finally arrives, or adding one picture shuffles the page
 * around it. That is the whole job of this component: identical geometry either way.
 *
 * `label` does double duty. It is the alt text a screen reader announces, and it is
 * what the placeholder derives its monogram and its colour from — so a picture named
 * for what it shows gets a sensible stand-in for nothing.
 *
 * No `loading="lazy"`. These sit near the top of the pages that use them, where a lazy
 * image is a blank space at the moment somebody is looking straight at it.
 */
export interface Picture {
  /** A path from the site root, e.g. '/home/ground.jpeg'. Empty means "not yet". */
  image: string
  /** What the picture shows. Alt text, and the monogram's source. */
  label: string
}

type Shape = 'square' | 'wide' | 'portrait' | 'circle'

/** Mirrors the shapes in PlaceholderImage, so the two are interchangeable. */
const ASPECT: Record<Shape, string> = {
  square: 'aspect-square',
  wide: 'aspect-16/10',
  portrait: 'aspect-4/5',
  circle: 'aspect-square',
}

export function Photo({
  picture,
  shape = 'wide',
  className,
}: {
  picture: Picture
  shape?: Shape
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
        // Cropped from the centre, which is why every editing note asks for the
        // subject in the middle of the frame.
        'object-cover',
        shape === 'circle' ? 'rounded-full' : 'rounded-card',
        ASPECT[shape],
        className
      )}
    />
  )
}
