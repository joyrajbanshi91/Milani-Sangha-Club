import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'

export function mount(): void {
  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Root element #root was not found in index.html')
  }

  createRoot(container).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
        <PwaUpdatePrompt />
      </AppProviders>
    </StrictMode>
  )
}
