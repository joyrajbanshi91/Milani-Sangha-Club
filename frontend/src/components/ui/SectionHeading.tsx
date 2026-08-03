import { cn } from '@/lib/cn'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  lead?: string
  align?: 'left' | 'centre'
  /** 'onDark' inverts the colours for use inside a brand-toned section. */
  tone?: 'onLight' | 'onDark'
  /** Heading level — keep one `h1` per page. */
  as?: 'h1' | 'h2'
  className?: string
}

/**
 * The standard section header: a small gold eyebrow, a serif title, and an
 * optional lead paragraph. Used on every page so headings stay consistent.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  tone = 'onLight',
  as: Heading = 'h2',
  className,
}: SectionHeadingProps) {
  const onDark = tone === 'onDark'

  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'centre' && 'mx-auto text-center',
        className
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'text-xs font-semibold uppercase tracking-[0.18em]',
            onDark ? 'text-accent-300' : 'text-accent-600'
          )}
        >
          {eyebrow}
        </p>
      ) : null}

      <Heading
        className={cn(
          'font-display tracking-tight',
          eyebrow && 'mt-3',
          Heading === 'h1' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl',
          onDark && 'text-white'
        )}
      >
        {title}
      </Heading>

      {lead ? (
        <p className={cn('mt-4 text-lg/relaxed', onDark ? 'text-brand-100' : 'text-ink-600')}>
          {lead}
        </p>
      ) : null}
    </div>
  )
}
