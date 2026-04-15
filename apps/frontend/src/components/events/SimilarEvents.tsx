import { trpc } from '@/lib/trpc'
import { EventCard } from './EventCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface SimilarEventsProps {
  eventId: string
  category: string
}

function EventCardSkeleton() {
  return (
    <Card className="w-[300px] shrink-0 overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </Card>
  )
}

export function SimilarEvents({ eventId, category }: SimilarEventsProps) {
  const { data, isLoading } = trpc.events.list.useQuery(
    { category: category ? [category as any] : undefined, limit: 7 },
    {
      staleTime: 5 * 60 * 1000,
    }
  )

  const similarEvents = data?.events?.filter((e: any) => e.id !== eventId).slice(0, 6)

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="similar-events-loading">
        <h2 className="text-2xl font-semibold">Similar Events</h2>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 pb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    )
  }

  if (!similarEvents || similarEvents.length === 0) {
    return null
  }

  return (
    <div className="space-y-4" data-testid="similar-events">
      <h2 className="text-2xl font-semibold">Similar Events</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {similarEvents.map((event) => (
            <div key={event.id} className="w-[300px] shrink-0">
              <EventCard event={event} />
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
