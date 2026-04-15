import { Link } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  MapPin,
  Music2,
  Share2,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { formatEventDate, getCategoryColor } from '@/lib/utils'
import { getImageUrl } from '@/lib/api'
import { format } from 'date-fns'

function TonightEventCard({ event, isLive }: { event: any; isLive?: boolean }) {
  const category = Array.isArray(event.category) ? event.category[0] : event.category
  const venueName = event.venue?.name || 'TBA'
  const imageUrl = event.images?.[0] || event.venue?.imageUrl
  const artistInfo = event.metadata?.artistInfo

  return (
    <Link to={`/events/${event.id}`}>
      <Card className="group h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {imageUrl ? (
            <img
              src={getImageUrl(imageUrl)}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />
          )}
          {isLive && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              LIVE
            </div>
          )}
          {artistInfo?.spotifyUrl && (
            <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <Music2 className="h-3.5 w-3.5 text-green-400" />
            </div>
          )}
        </div>
        <CardContent className="space-y-2 pt-4">
          <h3 className="font-display text-base font-bold leading-tight line-clamp-2">
            {event.title}
          </h3>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span>{formatEventDate(event.startDateTime, event.endDateTime)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="line-clamp-1">{venueName}</span>
            </div>
          </div>
          <div className="flex gap-1.5 pt-1">
            {category && (
              <Badge className={getCategoryColor(category)} variant="secondary">
                {category}
              </Badge>
            )}
            {event.isFree && <Badge variant="secondary">Free</Badge>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function SectionHeader({
  icon,
  title,
  count,
  pulse,
}: {
  icon?: React.ReactNode
  title: string
  count: number
  pulse?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 pb-3 pt-2">
      {pulse ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      ) : (
        icon
      )}
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <Badge variant="secondary" className="font-mono text-xs">
        {count} {count === 1 ? 'event' : 'events'}
      </Badge>
    </div>
  )
}

function EventGrid({ events, isLive }: { events: any[]; isLive?: boolean }) {
  return (
    <div className="grid gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event: any) => (
        <TonightEventCard key={event.id} event={event} isLive={isLive} />
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <CardContent className="space-y-2 pt-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center border-dashed p-12 text-center">
      <Calendar className="h-12 w-12 text-muted-foreground/30" />
      <h3 className="mt-4 font-display text-lg font-bold">SLO is quiet tonight</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        No events found for this evening. Check back tomorrow or see what's coming up this weekend.
      </p>
      <Link to="/">
        <Button variant="outline" className="mt-4">
          <ChevronRight className="mr-2 h-4 w-4" /> Browse All Events
        </Button>
      </Link>
    </Card>
  )
}

function ShareBar() {
  const handleShare = async () => {
    const url = `${window.location.origin}/tonight?d=${format(new Date(), 'yyyy-MM-dd')}`
    if (navigator.share) {
      try {
        await navigator.share({ title: "Tonight in SLO", url })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="mt-6 flex items-center justify-center gap-3 rounded-lg bg-muted p-4">
      <p className="text-sm text-muted-foreground">Know someone who'd want to come?</p>
      <Button onClick={handleShare} size="sm">
        <Share2 className="mr-2 h-4 w-4" /> Share Tonight
      </Button>
    </div>
  )
}

export function TonightPage() {
  const tonight = trpc.events.tonight.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  })

  const weekend = trpc.events.weekend.useQuery()

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Tonight in SLO
        </h1>
        <p className="mt-1 text-muted-foreground">
          What's happening in San Luis Obispo right now
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {format(new Date(), "EEEE, MMM d 'at' h:mm a")}
        </div>
      </div>

      <Tabs defaultValue="tonight" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tonight">Tonight</TabsTrigger>
          <TabsTrigger value="weekend">This Weekend</TabsTrigger>
        </TabsList>

        <TabsContent value="tonight" className="space-y-2">
          {tonight.isLoading && <LoadingSkeleton />}

          {tonight.error && (
            <Card className="p-6 text-center text-sm text-destructive">
              Something went wrong loading tonight's events. Try refreshing.
            </Card>
          )}

          {tonight.data && tonight.data.totalCount === 0 && <EmptyState />}

          {tonight.data && tonight.data.totalCount > 0 && (
            <>
              {tonight.data.happeningNow.length > 0 && (
                <section>
                  <SectionHeader
                    title="Happening Now"
                    count={tonight.data.happeningNow.length}
                    pulse
                  />
                  <EventGrid events={tonight.data.happeningNow} isLive />
                </section>
              )}

              {tonight.data.comingUp.length > 0 && (
                <section>
                  <SectionHeader
                    icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                    title="Coming Up"
                    count={tonight.data.comingUp.length}
                  />
                  <EventGrid events={tonight.data.comingUp} />
                </section>
              )}

              {tonight.data.laterTonight.length > 0 && (
                <section>
                  <SectionHeader
                    icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                    title="Later Tonight"
                    count={tonight.data.laterTonight.length}
                  />
                  <EventGrid events={tonight.data.laterTonight} />
                </section>
              )}

              <ShareBar />
            </>
          )}
        </TabsContent>

        <TabsContent value="weekend">
          {weekend.isLoading && <LoadingSkeleton />}

          {weekend.error && (
            <Card className="p-6 text-center text-sm text-destructive">
              Something went wrong loading weekend events.
            </Card>
          )}

          {weekend.data && weekend.data.totalCount === 0 && (
            <Card className="flex flex-col items-center justify-center border-dashed p-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/30" />
              <h3 className="mt-4 font-display text-lg font-bold">Quiet weekend ahead</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No weekend events found yet. Check back later.
              </p>
            </Card>
          )}

          {weekend.data && weekend.data.totalCount > 0 && (
            <section>
              <SectionHeader
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                title="This Weekend"
                count={weekend.data.totalCount}
              />
              <EventGrid events={weekend.data.events} />
              <ShareBar />
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
