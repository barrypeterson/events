import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AdminPage() {
  const [page, setPage] = useState(0)
  const [selectedVenueId, setSelectedVenueId] = useState<string | undefined>(undefined)
  const pageSize = 50

  // Fetch venues for the filter dropdown
  const { data: venuesData } = trpc.venues.list.useQuery({
    limit: 100,
  })

  const { data, isLoading, error, refetch } = trpc.events.list.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    showPastEvents: true,
    venueId: selectedVenueId,
  })

  const markRecurringMutation = trpc.events.markRecurring.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  const handleMarkRecurring = async (eventId: string, isRecurring: boolean) => {
    markRecurringMutation.mutate({ eventId, isRecurring })
  }

  const handleVenueChange = (value: string) => {
    setSelectedVenueId(value === 'all' ? undefined : value)
    setPage(0) // Reset to first page when filter changes
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      MUSIC: 'bg-purple-100 text-purple-800',
      COMEDY: 'bg-yellow-100 text-yellow-800',
      THEATER: 'bg-pink-100 text-pink-800',
      SPORTS: 'bg-blue-100 text-blue-800',
      FOOD_WINE: 'bg-orange-100 text-orange-800',
      ARTS: 'bg-green-100 text-green-800',
      COMMUNITY: 'bg-cyan-100 text-cyan-800',
      FAMILY: 'bg-rose-100 text-rose-800',
      OUTDOOR: 'bg-emerald-100 text-emerald-800',
      FITNESS: 'bg-lime-100 text-lime-800',
      EDUCATION: 'bg-indigo-100 text-indigo-800',
      BUSINESS: 'bg-slate-100 text-slate-800',
      OTHER: 'bg-gray-100 text-gray-800',
    }
    return colors[category] || colors.OTHER
  }

  if (error) {
    return (
      <div className="container py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">Error loading events: {error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-lg text-muted-foreground">
          View and manage all events and venues
        </p>
        <div className="mt-4 flex gap-2">
          <Link to="/admin/venues">
            <Button variant="outline">Manage Venues</Button>
          </Link>
          <Link to="/admin/media">
            <Button variant="outline">Manage Images</Button>
          </Link>
          <Link to="/admin/scraper-playground">
            <Button variant="outline">Scraper Playground</Button>
          </Link>
          <Link to="/admin/design-system">
            <Button variant="outline">Design System</Button>
          </Link>
          <Link to="/admin/venue-scraping">
            <Button variant="outline">Venue Scraping</Button>
          </Link>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">All Events</h2>
              {data && (
                <p className="text-sm text-muted-foreground">
                  Showing {data.pagination.offset + 1} to{' '}
                  {Math.min(
                    data.pagination.offset + data.pagination.limit,
                    data.pagination.total
                  )}{' '}
                  of {data.pagination.total} events
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-[300px]">
              <label className="mb-2 block text-sm font-medium">
                Filter by Venue
              </label>
              <Select
                value={selectedVenueId || 'all'}
                onValueChange={handleVenueChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Venues" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Venues</SelectItem>
                  {venuesData?.venues.map((venue: any) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedVenueId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleVenueChange('all')}
                className="mt-7"
              >
                Clear Filter
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : data && data.events.length > 0 ? (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Event Title</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((event: any) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">
                        <div className="max-w-[300px]">
                          <div className="truncate">{event.title}</div>
                          {event.isRecurring && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Recurring
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate">
                          {event.venue?.name || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(event.startDateTime)}
                      </TableCell>
                      <TableCell>
                        {event.category && event.category.length > 0 ? (
                          <Badge
                            className={getCategoryColor(event.category[0])}
                            variant="secondary"
                          >
                            {event.category[0]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {event.isFree ? (
                          <Badge variant="outline" className="bg-green-50">
                            Free
                          </Badge>
                        ) : event.priceMin && event.priceMax ? (
                          <span className="text-sm">
                            ${event.priceMin} - ${event.priceMax}
                          </span>
                        ) : event.priceMin ? (
                          <span className="text-sm">${event.priceMin}+</span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!event.isRecurring ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkRecurring(event.id, true)}
                              disabled={markRecurringMutation.isPending}
                            >
                              Mark Recurring
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkRecurring(event.id, false)}
                              disabled={markRecurringMutation.isPending}
                            >
                              Unmark
                            </Button>
                          )}
                          <Link to={`/events/${event.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {data.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page + 1 >= data.pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No events found</p>
          </div>
        )}
      </Card>
    </div>
  )
}
