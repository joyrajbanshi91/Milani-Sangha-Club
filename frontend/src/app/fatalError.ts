/**
 * Last-resort renderer for failures that happen before React mounts — a missing
 * Firebase environment variable being the common one. Uses inline styles only,
 * because a stylesheet may not have loaded at this point.
 */
export function renderFatalError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'

  console.error('[boot] the application failed to start', error)

  const root = document.getElementById('root')
  if (!root) return

  const wrapper = document.createElement('div')
  wrapper.setAttribute(
    'style',
    'max-width:44rem;margin:4rem auto;padding:0 1.5rem;font:16px/1.6 system-ui,sans-serif;color:#1e293b'
  )

  const heading = document.createElement('h1')
  heading.textContent = 'The application could not start'
  heading.setAttribute('style', 'font-size:1.5rem;margin:0 0 .75rem;color:#0f3d2e')

  const intro = document.createElement('p')
  intro.textContent = 'Configuration is incomplete or invalid:'
  intro.setAttribute('style', 'margin:0 0 .75rem')

  const detail = document.createElement('pre')
  detail.textContent = message
  detail.setAttribute(
    'style',
    'white-space:pre-wrap;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:.5rem;padding:1rem;font-size:.85rem;overflow-x:auto'
  )

  wrapper.append(heading, intro, detail)
  root.replaceChildren(wrapper)
}
