import './index.css'

import { renderFatalError } from '@/app/fatalError'

/**
 * The app is imported dynamically so that configuration errors thrown while
 * modules evaluate (see config/env.ts) can be caught and shown as readable text
 * instead of leaving the member staring at a blank screen.
 */
void (async () => {
  try {
    const { mount } = await import('@/app/mount')
    mount()
  } catch (error) {
    renderFatalError(error)
  }
})()
