import { SearchBar } from '@/components/events/SearchBar'
import { EventFilters } from '@/components/events/EventFilters'
import { EventList } from '@/components/events/EventList'
import { useEvents } from '@/hooks/useEvents'
import { useSearchStore } from '@/stores/search'
import { Separator } from '@/components/ui/separator'

export function EventsPage() {
  const { query, filters } = useSearchStore()

  const { data, isLoading, error } = useEvents({
    ...filters,
    search: query || undefined,
  })

  return (
    <div className="container py-8" data-testid="events-page">
      <div className="mb-8 space-y-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight">
            Discover Events in SLO
          </h1>
          <p className="text-lg text-muted-foreground">
            Find the best events happening in San Luis Obispo
          </p>
        </div>

        <SearchBar />

        <Separator />

        <EventFilters />
      </div>

      <EventList
        events={data?.events}
        isLoading={isLoading}
        error={error as Error | null}
      />
    </div>
  )
}
