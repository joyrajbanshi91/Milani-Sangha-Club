import { ArrowUp } from 'lucide-react'
import { useEffect, useRef } from 'react'

/**
 * Floating "back to top" control, shown once the visitor has scrolled a screen
 * or so.
 *
 * Visibility is toggled through a data attribute rather than React state:
 * scrolling fires continuously, and re-rendering on every scroll event to flip
 * one boolean is exactly the kind of work that makes a page feel sluggish on a
 * mid-range phone.
 */
export function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    let queued = false
    const update = () => {
      queued = false
      node.setAttribute('data-visible', String(window.scrollY > 700))
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      data-visible="false"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      className="fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-900 text-white shadow-lift transition-all duration-300 hover:bg-brand-800 data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-3 data-[visible=false]:opacity-0"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
