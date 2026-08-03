import type { ReactNode } from 'react'

/**
 * Continuous horizontal ticker.
 *
 * The children are rendered twice — once for reading, once purely to make the
 * loop seamless — so the duplicate is hidden from assistive technology. The
 * animation pauses on hover and on keyboard focus, and stops entirely under
 * `prefers-reduced-motion`, where the CSS lets the row wrap instead.
 */
export function Marquee({ children }: { children: ReactNode }) {
  return (
    <div className="marquee" role="group" aria-label="Our supporters">
      <div className="marquee__track gap-4 pr-4">
        <div className="flex shrink-0 gap-4">{children}</div>
        <div className="flex shrink-0 gap-4" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}
