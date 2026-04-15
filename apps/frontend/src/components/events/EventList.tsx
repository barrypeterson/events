import { EventCard } from './EventCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import type { Event } from '@/types'

interface EventListProps {
  events?: Event[]
  isLoading?: boolean
  error?: Error | null
}

function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden" data-testid="event-card-skeleton">
      <Skeleton className="aspect-video w-full" />
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
    </Card>
  )
}

function EmptyState() {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center py-16 text-center"
      data-testid="empty-state"
    >
      <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">No events found</h3>
      <p className="text-sm text-muted-foreground">
        Try adjusting your search or filters to find more events
      </p>
    </div>
  )
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center py-16 text-center"
      data-testid="error-state"
    >
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <Calendar className="h-12 w-12 text-destructive" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">Something went wrong</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {error.message || 'Failed to load events. Please try again later.'}
      </p>
    </div>
  )
}

export function EventList({ events, isLoading, error }: EventListProps) {
  if (error) {
    return <ErrorState error={error} />
  }

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        data-testid="event-list-loading"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return <EmptyState />
  }

  return (
    <div
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      data-testid="event-list"
    >
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}
