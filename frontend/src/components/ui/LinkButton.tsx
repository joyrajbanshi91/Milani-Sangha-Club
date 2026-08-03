import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'onDark' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-950',
  secondary: 'border border-brand-200 bg-brand-50 text-brand-900 hover:bg-brand-100',
  onDark: 'bg-accent-400 text-brand-950 hover:bg-accent-300',
  ghost: 'text-brand-900 hover:bg-brand-50',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

interface LinkButtonProps {
  to: string
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
  /** Treat `to` as an external URL: renders an anchor, opens in a new tab. */
  external?: boolean
}

/**
 * A link that looks like a button.
 *
 * Separate from `Button` on purpose: nesting an anchor inside a `<button>` is
 * invalid HTML and breaks keyboard and screen-reader behaviour. If it navigates,
 * it is a link; if it acts, it is a button.
 */
export function LinkButton({
  to,
  children,
  variant = 'primary',
  size = 'md',
  className,
  external = false,
}: LinkButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    VARIANTS[variant],
    SIZES[size],
    className
  )

  if (external) {
    return (
      <a href={to} className={classes} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    )
  }

  return (
    <Link to={to} className={classes}>
      {children}
    </Link>
  )
}
