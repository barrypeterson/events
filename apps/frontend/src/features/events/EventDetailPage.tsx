import { useParams } from 'react-router-dom'
import { EventDetail } from '@/components/events/EventDetail'
import { SimilarEvents } from '@/components/events/SimilarEvents'
import { useEventDetail } from '@/hooks/useEventDetail'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Card } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

function EventDetailSkeleton() {
  return (
    <div className="container py-8 space-y-6" data-testid="event-detail-loading">
      <Skeleton className="h-10 w-32" />
      <Skeleton className="aspect-[21/9] w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-12 w-3/4" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        <div className="lg:col-span-1">
          <Card className="p-6">
            <Skeleton className="h-6 w-24 mb-4" />
            <Skeleton className="aspect-video w-full" />
          </Card>
        </div>
      </div>
    </div>
  )
}

function EventNotFound() {
  return (
    <div
      className="container flex min-h-[60vh] items-center justify-center py-8"
      data-testid="event-not-found"
    >
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold">Event Not Found</h1>
        <p className="mb-6 text-muted-foreground">
          Sorry, we couldn't find the event you're looking for.
        </p>
        <Link to="/">
          <Button>Back to Events</Button>
        </Link>
      </div>
    </div>
  )
}

function EventError({ error }: { error: Error }) {
  return (
    <div
      className="container flex min-h-[60vh] items-center justify-center py-8"
      data-testid="event-error"
    >
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold">Something went wrong</h1>
        <p className="mb-6 text-muted-foreground max-w-md mx-auto">
          {error.message || 'Failed to load event details. Please try again later.'}
        </p>
        <Link to="/">
          <Button>Back to Events</Button>
        </Link>
      </div>
    </div>
  )
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: event, isLoading, error } = useEventDetail(id!)

  if (isLoading) {
    return <EventDetailSkeleton />
  }

  if (error) {
    return <EventError error={error as Error} />
  }

  if (!event) {
    return <EventNotFound />
  }

  return (
    <div className="container py-8 space-y-12" data-testid="event-detail-page">
      <EventDetail event={event} />

      <Separator />

      <SimilarEvents eventId={event.id} category={event.category} />
    </div>
  )
}
