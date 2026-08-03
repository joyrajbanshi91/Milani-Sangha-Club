import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/apiError'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a 401 or a 422 only wastes the member's data allowance.
          if (error instanceof ApiError && error.isClientError) return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}
