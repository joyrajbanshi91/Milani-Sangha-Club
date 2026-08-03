import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

type Variant = 'neutral' | 'brand' | 'accent' | 'outline'

const VARIANTS: Record<Variant, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-800',
  accent: 'bg-accent-100 text-accent-700',
  outline: 'border border-current text-ink-500',
}

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
}
