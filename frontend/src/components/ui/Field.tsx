import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { controlClasses } from '@/lib/formStyles'

interface FieldProps {
  /** Must match the control's `id`. */
  htmlFor: string
  label: string
  /** Validation message. Presence switches the field into its error state. */
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/**
 * Label, control and validation message as one unit.
 *
 * The error is linked to the control by `aria-describedby` at the call site and
 * carries `role="alert"`, so a screen-reader user hears the problem rather than
 * only seeing a red border.
 */
export function Field({
  htmlFor,
  label,
  error,
  hint,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-ink-400">(optional)</span>
        )}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClasses, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClasses, 'min-h-32 resize-y', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClasses, 'pr-10', className)} {...props} />
}
