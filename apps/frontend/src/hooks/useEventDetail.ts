import { trpc } from '@/lib/trpc'

export function useEventDetail(id: string) {
  return trpc.events.getById.useQuery(
    { id },
    {
      enabled: !!id,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )
}
