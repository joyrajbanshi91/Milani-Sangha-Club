import { PencilLine, X } from 'lucide-react'
import { useState } from 'react'

import { contentStatus } from '@/content/site'
import { isDevelopment } from '@/config/env'

/**
 * Development-only reminder that the site is still showing placeholder copy.
 *
 * This exists because the most likely mistake with a content-driven site is
 * publishing it with the sample committee names and empty fees still in place.
 * It never renders for real visitors — only in `npm run dev`, and only while
 * `contentStatus` in src/content/site.ts is 'placeholder'.
 */
export function DraftContentNotice() {
  const [dismissed, setDismissed] = useState(false)

  if (!isDevelopment || contentStatus !== 'placeholder' || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-xs rounded-card border border-accent-300 bg-accent-50 p-4 shadow-lift">
      <div className="flex items-start gap-3">
        <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
        <div className="text-xs/relaxed text-accent-700">
          <p className="font-semibold">Placeholder content</p>
          <p className="mt-1">
            Committee names, quotes, dates and fees are samples. Edit{' '}
            <code className="rounded bg-white/70 px-1">src/content/site.ts</code>, then set{' '}
            <code className="rounded bg-white/70 px-1">contentStatus</code> to{' '}
            <code className="rounded bg-white/70 px-1">'reviewed'</code> to hide this.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded p-1 text-accent-700 hover:bg-white/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
