import { useParams, Link } from 'react-router-dom'
import { MapPin, ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EventList } from '@/components/events/EventList'
import { trpc } from '@/lib/trpc'

export function VenuePage() {
  const { venueId } = useParams<{ venueId: string }>()

  const { data: venue, isLoading: venueLoading } = trpc.venues.getById.useQuery(
    { id: venueId! },
    { enabled: !!venueId }
  )

  const { data: eventsData, isLoading: eventsLoading } = trpc.events.list.useQuery(
    { venueId, limit: 100 },
    { enabled: !!venueId }
  )

  if (venueLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-muted rounded mb-4" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="container py-8">
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-4">Venue Not Found</h1>
          <Link to="/">
            <Button>Back to Events</Button>
          </Link>
        </div>
      </div>
    )
  }

  const mapUrl = venue.latitude && venue.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${venue.address || ''} ${venue.city} ${venue.state}`
      )}`

  return (
    <div className="container py-8" data-testid="venue-page">
      <div className="mb-8">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to All Events
          </Button>
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              {venue.name}
            </h1>

            <div className="space-y-3 text-muted-foreground mb-6">
              {venue.address && (
                <div className="flex items-start">
                  <MapPin className="mr-3 h-5 w-5 mt-0.5" />
                  <div className="flex flex-col">
                    <span>{venue.address}</span>
                    <span>
                      {venue.city}, {venue.state} {venue.zipCode}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mb-6"
              >
                <Button variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Visit Website
                </Button>
              </a>
            )}
          </div>

          {venue.latitude && venue.longitude && (
            <div className="lg:col-span-1">
              <Card>
                <CardContent className="p-6">
                  <h3 className="mb-4 font-semibold">Location</h3>
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted mb-4">
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      src={`https://www.google.com/maps/embed/v1/place?key=&q=${venue.latitude},${venue.longitude}`}
                      allowFullScreen
                      className="border-0"
                      title="Venue location map"
                    />
                  </div>
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full">
                      <MapPin className="mr-2 h-4 w-4" />
                      Get Directions
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <Separator className="my-8" />

        <h2 className="text-2xl font-semibold mb-6">
          Upcoming Events at {venue.name}
        </h2>
      </div>

      <EventList
        events={eventsData?.events}
        isLoading={eventsLoading}
        error={null}
      />
    </div>
  )
}
