import { useEffect, useRef } from 'react'

/**
 * Counts a figure up when it first scrolls into view.
 *
 * The final value is what React renders, so it is correct before any script
 * runs and correct for anyone with reduced motion — the animation only ever
 * overwrites the text on its way to the same number. Values that are not
 * numeric (the placeholder '—', or '500+') are left exactly as given.
 */
export function AnimatedNumber({
  value,
  className,
  durationMs = 1400,
}: {
  value: string
  className?: string
  durationMs?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // A leading integer with an optional trailing suffix: '1,240', '250+',
    // '40 years'. Anything else — the placeholder '—' — is left untouched.
    const match = /^([\d,]+)(.*)$/.exec(value)
    if (!match?.[1]) return

    const target = Number(match[1].replace(/,/g, ''))
    if (!Number.isFinite(target) || target === 0) return

    const suffix = match[2] ?? ''
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduced || typeof IntersectionObserver === 'undefined') return

    const format = (n: number) => n.toLocaleString('en-IN') + suffix

    let frame = 0
    let start: number | null = null

    const step = (timestamp: number) => {
      start ??= timestamp
      const progress = Math.min((timestamp - start) / durationMs, 1)
      // Ease-out so it decelerates into the final figure.
      const eased = 1 - Math.pow(1 - progress, 3)
      node.textContent = format(Math.round(target * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer.unobserve(entry.target)
          frame = requestAnimationFrame(step)
        }
      },
      { threshold: 0.4 }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      // Restore the true value if we were interrupted part-way.
      node.textContent = value
    }
  }, [value, durationMs])

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  )
}
