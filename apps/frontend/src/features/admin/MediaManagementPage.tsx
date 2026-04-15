import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Image, Save, X } from 'lucide-react'

// Simple toast replacement until sonner is installed
const toast = {
  success: (message: string) => alert(message),
  error: (message: string) => alert(message),
}

export function MediaManagementPage() {
  const [venueImageUpdates, setVenueImageUpdates] = useState<Record<string, string>>({})
  const [eventImageUpdates, setEventImageUpdates] = useState<Record<string, string>>({})

  // Fetch venues
  const { data: venuesData, refetch: refetchVenues } = trpc.venues.list.useQuery({
    limit: 100,
  })

  // Fetch events
  const { data: eventsData, refetch: refetchEvents } = trpc.events.list.useQuery({
    limit: 100,
  })

  // Mutations
  const updateVenue = trpc.venues.update.useMutation({
    onSuccess: () => {
      toast.success('Venue image updated')
      refetchVenues()
    },
    onError: (error) => {
      toast.error(`Failed to update venue: ${error.message}`)
    },
  })

  const updateEvent = trpc.events.update.useMutation({
    onSuccess: () => {
      toast.success('Event images updated')
      refetchEvents()
    },
    onError: (error) => {
      toast.error(`Failed to update event: ${error.message}`)
    },
  })

  const handleUpdateVenueImage = async (venueId: string) => {
    const imageUrl = venueImageUpdates[venueId]
    if (!imageUrl) return

    await updateVenue.mutateAsync({
      id: venueId,
      imageUrl,
    })

    // Clear the input
    setVenueImageUpdates((prev) => {
      const next = { ...prev }
      delete next[venueId]
      return next
    })
  }

  const handleUpdateEventImages = async (eventId: string) => {
    const imageUrl = eventImageUpdates[eventId]
    if (!imageUrl) return

    await updateEvent.mutateAsync({
      id: eventId,
      images: [imageUrl],
    })

    // Clear the input
    setEventImageUpdates((prev) => {
      const next = { ...prev }
      delete next[eventId]
      return next
    })
  }

  const venues = venuesData?.venues || []
  const events = eventsData?.events || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Media Management</h1>
        <p className="text-muted-foreground">
          Manage venue and event images. Venues without images will use a placeholder, and events
          without images will fallback to their venue's image.
        </p>
      </div>

      <Tabs defaultValue="venues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="venues">
            <Image className="mr-2 h-4 w-4" />
            Venue Images ({venues.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <Image className="mr-2 h-4 w-4" />
            Event Images ({events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Venue Default Images</CardTitle>
              <CardDescription>
                Set a default image for each venue. This image will be used as a fallback for
                events at this venue that don't have their own image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current Image</TableHead>
                    <TableHead>New Image URL</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venues.map((venue: any) => {
                    const hasImage = !!venue.imageUrl
                    const pendingUpdate = venueImageUpdates[venue.id]

                    return (
                      <TableRow key={venue.id}>
                        <TableCell className="font-medium">{venue.name}</TableCell>
                        <TableCell>
                          {venue.venueType && (
                            <Badge variant="outline">{venue.venueType}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasImage ? (
                            <img
                              src={venue.imageUrl}
                              alt={venue.name}
                              className="h-12 w-20 rounded object-cover"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">No image</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={pendingUpdate || ''}
                            onChange={(e) =>
                              setVenueImageUpdates({
                                ...venueImageUpdates,
                                [venue.id]: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!pendingUpdate || updateVenue.isPending}
                              onClick={() => handleUpdateVenueImage(venue.id)}
                            >
                              <Save className="mr-1 h-3 w-3" />
                              Save
                            </Button>
                            {pendingUpdate && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const next = { ...venueImageUpdates }
                                  delete next[venue.id]
                                  setVenueImageUpdates(next)
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Images</CardTitle>
              <CardDescription>
                Manage event images. Events without images will automatically use their venue's
                default image as a fallback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Current Image</TableHead>
                    <TableHead>New Image URL</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event: any) => {
                    const hasImage = event.images?.length > 0
                    const pendingUpdate = eventImageUpdates[event.id]
                    const currentImageUrl = event.images?.[0]
                    const venueName = event.venue?.name || 'Unknown'

                    return (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium max-w-xs">
                          <div className="truncate">{event.title}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{venueName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {new Date(event.startDateTime).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          {hasImage ? (
                            <img
                              src={currentImageUrl}
                              alt={event.title}
                              className="h-12 w-20 rounded object-cover"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Using venue image
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="url"
                            placeholder="https://example.com/image.jpg"
                            value={pendingUpdate || ''}
                            onChange={(e) =>
                              setEventImageUpdates({
                                ...eventImageUpdates,
                                [event.id]: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!pendingUpdate || updateEvent.isPending}
                              onClick={() => handleUpdateEventImages(event.id)}
                            >
                              <Save className="mr-1 h-3 w-3" />
                              Save
                            </Button>
                            {pendingUpdate && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const next = { ...eventImageUpdates }
                                  delete next[event.id]
                                  setEventImageUpdates(next)
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
