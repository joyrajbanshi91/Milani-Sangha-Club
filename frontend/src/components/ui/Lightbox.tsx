import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface LightboxProps {
  open: boolean
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  title: string
  caption?: string
  /** Position indicator, e.g. "2 of 6". */
  counter?: string
  children: ReactNode
}

/**
 * Modal viewer for gallery items.
 *
 * Built on the native `<dialog>` element deliberately: the browser then provides
 * the focus trap, the inert background, the Escape handling and the correct
 * accessibility semantics. A hand-rolled div-with-overlay has to reimplement all
 * four, and usually gets the focus trap wrong.
 */
export function Lightbox({
  open,
  onClose,
  onPrevious,
  onNext,
  title,
  caption,
  counter,
  children,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // Where showModal is unavailable, fall back to a non-modal dialog. Without
    // this the viewer would render nothing at all rather than merely losing the
    // focus trap — a broken feature instead of a degraded one.
    if (typeof dialog.showModal !== 'function') {
      dialog.open = open
      return
    }

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault()
        onPrevious()
      }
      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault()
        onNext()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onPrevious, onNext])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="lightbox-title"
      // Escape triggers the dialog's own close event; keep React state in step.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      // Clicking the backdrop means clicking the dialog element itself, since
      // the panel inside stops the event from reaching here.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-full max-w-3xl bg-transparent p-4 backdrop:bg-ink-900/80 backdrop:backdrop-blur-sm"
    >
      <div
        className="overflow-hidden rounded-card bg-white shadow-lift"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="lightbox-title" className="font-display text-lg text-ink-900">
              {title}
            </h2>
            {counter ? <p className="mt-0.5 text-xs text-ink-500">{counter}</p> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="relative bg-ink-50">
          {children}

          {onPrevious ? (
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Previous"
              className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-800 shadow-lift transition-transform hover:scale-105"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}

          {onNext ? (
            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-800 shadow-lift transition-transform hover:scale-105"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {caption ? (
          <p className="border-t border-ink-200 px-5 py-4 text-sm/relaxed text-ink-600">{caption}</p>
        ) : null}

        <p className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-400">
          Use the arrow keys to move between albums, or Escape to close.
        </p>
      </div>
    </dialog>
  )
}
