import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** 'stagger' animates direct children in sequence instead of the box itself. */
  mode?: 'single' | 'stagger'
  as?: ElementType
  className?: string
}

/**
 * Settles its content into place as it scrolls into view.
 *
 * Implemented by toggling a data attribute on the DOM node rather than by
 * setting React state: a reveal is a purely visual event, and re-rendering the
 * subtree for it would be wasted work on a page with dozens of them.
 *
 * Two safety properties matter more than the animation:
 *   • If IntersectionObserver is unavailable (older browser, jsdom under test),
 *     the content is revealed immediately.
 *   • Under `prefers-reduced-motion` the CSS forces the final state, so nothing
 *     is ever left invisible because someone turned animations off.
 */
export function Reveal({ children, mode = 'single', as: Tag = 'div', className }: RevealProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const show = () => node.setAttribute('data-revealed', 'true')

    if (typeof IntersectionObserver === 'undefined') {
      show()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show()
          // One-shot: content should not fade out again on the way back up.
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const revealProps = mode === 'stagger' ? { 'data-reveal-stagger': '' } : { 'data-reveal': '' }

  return (
    <Tag ref={ref} className={className} {...revealProps}>
      {children}
    </Tag>
  )
}
