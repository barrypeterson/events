import { trpc } from '@/lib/trpc'
import type { EventFilters } from '@/types'

export function useEvents(filters?: EventFilters) {
  // Pass categories array directly to backend
  const backendFilters = filters ? {
    ...filters,
    query: filters.search || undefined, // Backend expects 'query' not 'search'
    category: filters.categories as any, // Backend expects 'category' not 'categories'
    limit: 100,
  } : {
    limit: 100,
  };

  return trpc.events.list.useQuery(backendFilters, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}
