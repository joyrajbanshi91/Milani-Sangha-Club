import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  body?: string
  icon?: LucideIcon
  className?: string
}

/**
 * Shown wherever a list is legitimately empty.
 *
 * An empty section should look considered rather than broken — a club that has
 * not yet published its next event is normal, and the page should say so
 * plainly instead of showing a blank space.
 */
export function EmptyState({ title, body, icon: Icon = Inbox, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-dashed border-ink-300 bg-ink-50/60 px-6 py-12 text-center',
        className
      )}
    >
      <Icon className="mx-auto h-7 w-7 text-ink-400" aria-hidden="true" />
      <p className="mt-3 font-medium text-ink-800">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p> : null}
    </div>
  )
}
