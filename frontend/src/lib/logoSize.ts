/**
 * Logo sizing.
 *
 * Class names are written out in full rather than assembled from the setting,
 * because Tailwind finds classes by scanning source text — a composed name like
 * `h-${n}` produces no CSS at all.
 *
 * The footer logo runs slightly larger than the header's: the header is a fixed
 * band that everything else has to fit inside, the footer is not.
 */
const SIZES = {
  sm: { header: 'h-8 max-w-24 lg:h-9', footer: 'h-9 max-w-28' },
  md: { header: 'h-10 max-w-32 lg:h-12', footer: 'h-11 max-w-36' },
  lg: { header: 'h-14 max-w-44 lg:h-16', footer: 'h-16 max-w-48' },
  xl: { header: 'h-16 max-w-56 lg:h-20', footer: 'h-20 max-w-60' },
  '2xl': { header: 'h-20 max-w-72 lg:h-24', footer: 'h-24 max-w-80' },
} as const

export type LogoSize = keyof typeof SIZES

/**
 * Falls back to 'md' on an unrecognised value, so a typo in the content file
 * shows a normally-sized logo rather than an unstyled one.
 */
export function logoClasses(size: string, place: 'header' | 'footer'): string {
  const entry = (SIZES as Record<string, { header: string; footer: string }>)[size] ?? SIZES.md
  return entry[place]
}
