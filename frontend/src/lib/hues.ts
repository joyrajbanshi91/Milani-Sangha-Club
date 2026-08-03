/**
 * Accent hues used to colour-code categories.
 *
 * Class names are written out in full rather than composed (`bg-${hue}-50`)
 * because Tailwind finds classes by scanning source text — an interpolated name
 * is invisible to it and the style silently goes missing in the build.
 *
 * A category always gets the same hue, derived from its own name, so "Sport"
 * stays green across the home page, the events list and every card.
 */
export interface Hue {
  /** Small badge or chip. */
  chip: string
  /** Icon tile: background + icon colour. */
  tile: string
  /** Border tint for a card in this hue. */
  border: string
  /** Soft background wash. */
  wash: string
  /** Accent bar or dot. */
  bar: string
}

export const HUES = {
  emerald: {
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70',
    tile: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    wash: 'bg-emerald-50/60',
    bar: 'bg-emerald-400',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70',
    tile: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
    wash: 'bg-amber-50/60',
    bar: 'bg-amber-400',
  },
  rose: {
    chip: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200/70',
    tile: 'bg-rose-100 text-rose-700',
    border: 'border-rose-200',
    wash: 'bg-rose-50/60',
    bar: 'bg-rose-400',
  },
  sky: {
    chip: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200/70',
    tile: 'bg-sky-100 text-sky-700',
    border: 'border-sky-200',
    wash: 'bg-sky-50/60',
    bar: 'bg-sky-400',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200/70',
    tile: 'bg-violet-100 text-violet-700',
    border: 'border-violet-200',
    wash: 'bg-violet-50/60',
    bar: 'bg-violet-400',
  },
  teal: {
    chip: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/70',
    tile: 'bg-teal-100 text-teal-700',
    border: 'border-teal-200',
    wash: 'bg-teal-50/60',
    bar: 'bg-teal-400',
  },
} as const satisfies Record<string, Hue>

export type HueName = keyof typeof HUES

const ORDER: ReadonlyArray<HueName> = ['emerald', 'amber', 'sky', 'rose', 'violet', 'teal']

/** Stable hue for a label, so the same category always looks the same. */
export function hueFor(label: string): Hue {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 1_000_003
  }
  const name = ORDER[hash % ORDER.length] ?? 'emerald'
  return HUES[name]
}

/** Hue by position — for lists where variety matters more than identity. */
export function hueByIndex(index: number): Hue {
  const name = ORDER[index % ORDER.length] ?? 'emerald'
  return HUES[name]
}
