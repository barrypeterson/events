import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Calendar as CalendarIcon, Music2, TrendingUp, Repeat } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatEventDate, getCategoryColor, truncate } from '@/lib/utils'
import { getImageUrl } from '@/lib/api'
import type { Event } from '@/types'

interface EventCardProps {
  event: Event
}

export function EventCard({ event }: EventCardProps) {
  const [imgError, setImgError] = useState(false)
  // Handle backend data structure
  const eventData = event as any;
  const category = Array.isArray(eventData.category) ? eventData.category[0] : eventData.category;
  const venueName = eventData.venue?.name || eventData.venue || 'TBA';
  const eventDate = eventData.startDateTime || eventData.date;
  const eventEndDate = eventData.endDateTime;
  // Fallback to venue image if event has no image
  const venueImageUrl = eventData.venue?.imageUrl;
  const imageUrl = eventData.images?.[0] || eventData.imageUrl || venueImageUrl;
  const artistInfo = event.metadata?.artistInfo;

  // Format listener count
  const formatListeners = (count?: number) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <Link to={`/events/${event.id}`} data-testid={`event-card-${event.id}`}>
      <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <div className="aspect-video w-full overflow-hidden bg-muted">
          {imageUrl && !imgError ? (
            <img
              src={getImageUrl(imageUrl)}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
              data-testid="event-card-image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
              <CalendarIcon className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-lg" data-testid="event-card-title">
              {event.title}
            </CardTitle>
            <div className="flex shrink-0 flex-col gap-1">
              {event.isFree && (
                <Badge variant="secondary">
                  Free
                </Badge>
              )}
              {event.isRecurring && (
                <Badge variant="outline" className="gap-1">
                  <Repeat className="h-3 w-3" />
                  <span>Recurring</span>
                </Badge>
              )}
            </div>
          </div>
          <CardDescription className="line-clamp-2" data-testid="event-card-description">
            {truncate(event.description, 100)}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 space-y-3">
          <div className="flex items-center text-sm text-muted-foreground">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span data-testid="event-card-date">{formatEventDate(eventDate, eventEndDate)}</span>
          </div>

          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="mr-2 h-4 w-4" />
            <span className="line-clamp-1" data-testid="event-card-venue">
              {venueName}
            </span>
          </div>

          {/* Artist info for music events */}
          {artistInfo && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {artistInfo.monthlyListeners && (
                <div className="flex items-center gap-1" title={`${artistInfo.monthlyListeners.toLocaleString()} monthly listeners on Spotify`}>
                  <Music2 className="h-3.5 w-3.5" />
                  <span className="font-medium">{formatListeners(artistInfo.monthlyListeners)}</span>
                </div>
              )}
              {artistInfo.popularity !== undefined && artistInfo.popularity > 0 && (
                <div className="flex items-center gap-1" title={`${artistInfo.popularity}% popularity on Spotify`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="font-medium">{artistInfo.popularity}%</span>
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center gap-2">
          <Badge
            className={getCategoryColor(category)}
            variant="outline"
            data-testid="event-card-category"
          >
            {category}
          </Badge>
          {/* Show top genre if available */}
          {artistInfo?.genres && artistInfo.genres.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {artistInfo.genres[0]}
            </Badge>
          )}
        </CardFooter>
      </Card>
    </Link>
  )
}
