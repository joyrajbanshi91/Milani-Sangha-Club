/**
 * Form control styling.
 *
 * Kept out of the component file so that module only exports components, which
 * is what React Fast Refresh needs to hot-reload a form without losing what the
 * member has already typed into it.
 */
export const controlClasses =
  'block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-soft transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-ink-50 disabled:text-ink-400'

/** Swaps a control's border and focus ring into its error state. */
export function fieldBorder(hasError: boolean): string {
  return hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-ink-300'
}
