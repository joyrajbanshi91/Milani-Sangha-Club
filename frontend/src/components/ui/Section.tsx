import type { ComponentProps } from 'react'

import { Container } from '@/components/ui/Container'
import { cn } from '@/lib/cn'

type Tone = 'white' | 'tint' | 'aurora' | 'auroraSoft' | 'brand'

const TONES: Record<Tone, string> = {
  white: 'bg-white',
  tint: 'bg-ink-50',
  /** Full colour mesh — for one or two feature bands per page, not every band. */
  aurora: 'bg-aurora',
  /** Quieter mesh, safe to alternate with `white`. */
  auroraSoft: 'bg-aurora-soft',
  brand: 'bg-shine text-brand-50',
}

interface SectionProps extends ComponentProps<'section'> {
  tone?: Tone
  /** Vertical rhythm. 'flush' removes padding for custom layouts. */
  size?: 'sm' | 'md' | 'lg' | 'flush'
  /** Set false to lay out the children yourself, outside the page gutter. */
  contained?: boolean
}

const SIZES = {
  sm: 'py-12',
  md: 'py-16 sm:py-20',
  lg: 'py-20 sm:py-28',
  flush: '',
}

/**
 * One band of a page. Alternating tones between consecutive sections is what
 * gives the site its rhythm, so prefer alternating `white` and `tint` rather
 * than adding rules and borders.
 */
export function Section({
  tone = 'white',
  size = 'md',
  contained = true,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn('relative', TONES[tone], SIZES[size], className)}
      {...props}
    >
      {contained ? <Container className="relative">{children}</Container> : children}
    </section>
  )
}
