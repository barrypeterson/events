import { useState } from 'react'
import { MapPin, Calendar as CalendarIcon, ExternalLink, Share2, ArrowLeft, User, Music2, TrendingUp, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import { formatEventDateLong, getCategoryColor } from '@/lib/utils'
import { getImageUrl, getMapUrl } from '@/lib/api'
import type { Event } from '@/types'

interface EventDetailProps {
  event: Event
}

export function EventDetail({ event }: EventDetailProps) {
  const [imgError, setImgError] = useState(false)
  // Handle backend data structure
  const eventData = event as any;
  const category = Array.isArray(eventData.category) ? eventData.category[0] : eventData.category;
  const venueName = eventData.venue?.name || eventData.venue || 'TBA';
  const venueAddress = eventData.venue?.address ? `${eventData.venue.address}, ${eventData.venue.city}` : eventData.venueAddress;
  const eventDate = eventData.startDateTime || eventData.date;
  const eventEndDate = eventData.endDateTime;
  // Fallback to venue image if event has no image
  const venueImageUrl = eventData.venue?.imageUrl;
  const imageUrl = eventData.images?.[0] || eventData.imageUrl || venueImageUrl;
  const ticketUrl = eventData.ticketUrl || eventData.url;
  const latitude = eventData.venue?.latitude || eventData.latitude;
  const longitude = eventData.venue?.longitude || eventData.longitude;
  const artistInfo = event.metadata?.artistInfo;

  // Format listener count
  const formatListeners = (count?: number) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.description || '',
          url: window.location.href,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    }
  }

  const mapUrl = latitude && longitude
    ? getMapUrl(latitude, longitude, venueName)
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}`

  return (
    <div className="space-y-6" data-testid="event-detail">
      <div className="flex items-center justify-between">
        <Link to="/">
          <Button variant="ghost" size="sm" data-testid="back-button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={handleShare} data-testid="share-button">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>

      {imageUrl && !imgError ? (
        <div className="overflow-hidden rounded-lg">
          <img
            src={getImageUrl(imageUrl)}
            alt={event.title}
            className="aspect-[21/9] w-full object-cover"
            data-testid="event-detail-image"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="flex aspect-[21/9] w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-accent/10">
          <CalendarIcon className="h-16 w-16 text-muted-foreground/20" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                className={getCategoryColor(category)}
                variant="outline"
                data-testid="event-detail-category"
              >
                {category}
              </Badge>
              {event.isFree && (
                <Badge variant="secondary" data-testid="event-detail-free">
                  Free
                </Badge>
              )}
              {event.isRecurring && (
                <Badge variant="outline" className="gap-1" data-testid="event-detail-recurring">
                  <Repeat className="h-3 w-3" />
                  Recurring
                </Badge>
              )}
            </div>

            <h1
              className="mb-4 text-4xl font-bold tracking-tight"
              data-testid="event-detail-title"
            >
              {event.title}
            </h1>

            <div className="space-y-3 text-muted-foreground">
              <div className="flex items-center">
                <CalendarIcon className="mr-3 h-5 w-5" />
                <span data-testid="event-detail-date">
                  {formatEventDateLong(eventDate, eventEndDate)}
                </span>
              </div>

              <div className="flex items-center">
                <MapPin className="mr-3 h-5 w-5" />
                <div className="flex flex-col">
                  {eventData.venue?.id ? (
                    <Link
                      to={`/venues/${eventData.venue.id}`}
                      className="hover:underline font-medium"
                      data-testid="event-detail-venue"
                    >
                      {venueName}
                    </Link>
                  ) : (
                    <span data-testid="event-detail-venue">{venueName}</span>
                  )}
                  {venueAddress && (
                    <span className="text-sm" data-testid="event-detail-address">
                      {venueAddress}
                    </span>
                  )}
                </div>
              </div>

              {eventData.organizerName && (
                <div className="flex items-center">
                  <User className="mr-3 h-5 w-5" />
                  <span data-testid="event-detail-organizer">
                    {eventData.organizerName}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="mb-4 text-2xl font-semibold">About this event</h2>
            <div
              className="prose prose-gray max-w-none dark:prose-invert"
              data-testid="event-detail-description"
            >
              <p className="whitespace-pre-wrap leading-relaxed">{event.description}</p>
            </div>
          </div>

          {ticketUrl && (
            <>
              <Separator />
              <div>
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="event-detail-url"
                >
                  <Button size="lg" className="w-full sm:w-auto">
                    Get Tickets
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          {/* Artist Info Card */}
          {artistInfo && (
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 font-semibold">Artist Info</h3>

                {/* Artist Image */}
                {artistInfo.imageUrl && (
                  <div className="mb-4 aspect-square w-full overflow-hidden rounded-lg">
                    <img
                      src={artistInfo.imageUrl}
                      alt={artistInfo.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}

                {/* Artist Name */}
                <h4 className="mb-3 text-lg font-semibold">{artistInfo.name}</h4>

                {/* Genres */}
                {artistInfo.genres && artistInfo.genres.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {artistInfo.genres.slice(0, 3).map((genre) => (
                      <Badge key={genre} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="mb-4 space-y-2 text-sm text-muted-foreground">
                  {artistInfo.monthlyListeners && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4" />
                        <span>Monthly Listeners</span>
                      </div>
                      <span className="font-semibold">{formatListeners(artistInfo.monthlyListeners)}</span>
                    </div>
                  )}
                  {artistInfo.popularity !== undefined && artistInfo.popularity > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        <span>Popularity</span>
                      </div>
                      <span className="font-semibold">{artistInfo.popularity}%</span>
                    </div>
                  )}
                </div>

                {/* Top Tracks */}
                {artistInfo.topTracks && artistInfo.topTracks.length > 0 && (
                  <div className="mb-4">
                    <h5 className="mb-2 text-sm font-semibold">Top Tracks</h5>
                    <div className="space-y-2">
                      {artistInfo.topTracks.map((track, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{idx + 1}.</span>
                          <span className="flex-1 truncate">{track.name}</span>
                          {track.previewUrl && (
                            <audio controls className="h-8 w-32">
                              <source src={track.previewUrl} type="audio/mpeg" />
                            </audio>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links */}
                <div className="space-y-2">
                  {artistInfo.spotifyUrl && (
                    <a
                      href={artistInfo.spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="default" className="w-full bg-green-600 hover:bg-green-700">
                        <Music2 className="mr-2 h-4 w-4" />
                        Listen on Spotify
                      </Button>
                    </a>
                  )}
                  {artistInfo.youtubeChannelUrl && (
                    <a
                      href={artistInfo.youtubeChannelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" className="w-full">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        YouTube Channel
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Location Card */}
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 font-semibold">Location</h3>
              {import.meta.env.VITE_GOOGLE_MAPS_KEY && (
                <div className="mb-4 aspect-video w-full overflow-hidden rounded-lg bg-muted">
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&q=${latitude && longitude ? `${latitude},${longitude}` : encodeURIComponent(venueName + ', San Luis Obispo, CA')}`}
                    allowFullScreen
                    className="border-0"
                    data-testid="event-detail-map"
                    title="Event location map"
                  />
                </div>
              )}
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="view-map-link"
              >
                <Button variant="outline" className="w-full">
                  <MapPin className="mr-2 h-4 w-4" />
                  View in Maps
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
