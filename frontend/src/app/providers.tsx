import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { createQueryClient } from '@/app/queryClient'
import { AuthProvider } from '@/features/auth/useAuth'

/**
 * Application-wide providers.
 *
 * Auth context (Phase 3), notification context (Phase 13) and settings context
 * are added here as those phases land, so that composition order stays visible
 * in one file.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // useState keeps a single client instance across re-renders without making it
  // a module-level singleton (which would leak state between tests).
  const [queryClient] = useState(createQueryClient)

  // AuthProvider sits inside QueryClientProvider because it uses queries to load
  // the signed-in user.
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
