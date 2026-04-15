import { useState } from 'react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

export function VenuesAdminPage() {
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(new Set())
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [canonicalVenueId, setCanonicalVenueId] = useState<string | null>(null)

  const { data: venuesData, isLoading, error, refetch } = trpc.venues.listWithDuplicates.useQuery()

  const { data: duplicatesData } = trpc.venues.findDuplicates.useQuery()

  const mergeMutation = trpc.venues.merge.useMutation({
    onSuccess: () => {
      refetch()
      setSelectedVenues(new Set())
      setShowMergeDialog(false)
      setCanonicalVenueId(null)
    },
  })

  const handleSelectVenue = (venueId: string, checked: boolean) => {
    const newSelected = new Set(selectedVenues)
    if (checked) {
      newSelected.add(venueId)
    } else {
      newSelected.delete(venueId)
    }
    setSelectedVenues(newSelected)
  }

  const handleMergeClick = () => {
    if (selectedVenues.size < 2) return

    // Auto-select the venue with the most events as canonical
    const selected = venuesData?.filter((v: any) => selectedVenues.has(v.id)) || []
    const canonical = selected.reduce((max: any, v: any) =>
      (v._count?.events || 0) > (max._count?.events || 0) ? v : max
    , selected[0])

    setCanonicalVenueId(canonical.id)
    setShowMergeDialog(true)
  }

  const handleConfirmMerge = () => {
    if (!canonicalVenueId) return

    const duplicateIds = Array.from(selectedVenues).filter(id => id !== canonicalVenueId)

    mergeMutation.mutate({
      canonicalId: canonicalVenueId,
      duplicateIds,
    })
  }

  const getDuplicateGroups = () => {
    if (!duplicatesData) return []
    return duplicatesData
  }

  if (error) {
    return (
      <div className="container py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">Error loading venues: {error.message}</p>
        </div>
      </div>
    )
  }

  const selectedVenuesList = venuesData?.filter((v: any) => selectedVenues.has(v.id)) || []
  const canonicalVenue = selectedVenuesList.find((v: any) => v.id === canonicalVenueId)
  const duplicateVenues = selectedVenuesList.filter((v: any) => v.id !== canonicalVenueId)

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Venues Management</h1>
        <p className="text-lg text-muted-foreground">
          Manage venues and merge duplicates
        </p>
      </div>

      {/* Duplicate Warnings */}
      {duplicatesData && duplicatesData.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50 p-4">
          <h3 className="mb-2 font-semibold text-orange-900">
            ⚠️ {duplicatesData.length} Potential Duplicate Group(s) Detected
          </h3>
          <p className="text-sm text-orange-800">
            Select venues below and click "Merge Selected" to consolidate duplicates
          </p>
        </Card>
      )}

      {/* Selection Actions */}
      {selectedVenues.size > 0 && (
        <Card className="mb-6 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selectedVenues.size} venue(s) selected</p>
              <p className="text-sm text-muted-foreground">
                Select 2 or more venues to merge them
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedVenues(new Set())}
              >
                Clear Selection
              </Button>
              <Button
                onClick={handleMergeClick}
                disabled={selectedVenues.size < 2}
              >
                Merge Selected ({selectedVenues.size})
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Venues Table */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold">All Venues</h2>
          {venuesData && (
            <p className="text-sm text-muted-foreground">
              {venuesData.length} venues total
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : venuesData && venuesData.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Select</TableHead>
                  <TableHead className="w-[300px]">Venue Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venuesData.map((venue: any) => {
                  const isDuplicate = venue.duplicateOf?.length > 0
                  const hasDuplicates = venue.duplicates?.length > 0
                  const canonicalVenue = isDuplicate ? venue.duplicateOf[0]?.canonicalVenue : null

                  return (
                    <>
                      {/* Main Venue Row */}
                      <TableRow
                        key={venue.id}
                        className={selectedVenues.has(venue.id) ? 'bg-muted' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedVenues.has(venue.id)}
                            onCheckedChange={(checked) =>
                              handleSelectVenue(venue.id, checked as boolean)
                            }
                            disabled={isDuplicate}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[300px]">
                            <div className="flex items-center gap-2">
                              {isDuplicate && (
                                <span className="text-muted-foreground">↳</span>
                              )}
                              <div className="truncate">{venue.name}</div>
                            </div>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {isDuplicate && canonicalVenue && (
                                <Badge variant="outline" className="text-xs bg-yellow-100 border-yellow-300">
                                  → Merged into: {canonicalVenue.name}
                                </Badge>
                              )}
                              {hasDuplicates && (
                                <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                                  ✓ Canonical ({venue.duplicates.length} merged)
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{venue.city || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate">
                            {venue.address || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell>{venue._count?.events || 0}</TableCell>
                        <TableCell>
                          {isDuplicate ? (
                            <Badge variant="secondary" className="bg-yellow-50">
                              Merged
                            </Badge>
                          ) : hasDuplicates ? (
                            <Badge variant="outline" className="bg-green-50 border-green-200">
                              Canonical
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Show merged venues indented below canonical */}
                      {hasDuplicates && venue.duplicates?.map((dup: any) => (
                        <TableRow
                          key={`dup-${dup.duplicateVenue.id}`}
                          className="bg-yellow-50/50 border-l-4 border-yellow-300"
                        >
                          <TableCell></TableCell>
                          <TableCell className="font-medium">
                            <div className="max-w-[300px] pl-6">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>↳</span>
                                <div className="truncate">{dup.duplicateVenue.name}</div>
                              </div>
                              <div className="flex gap-1 mt-1 text-xs">
                                <Badge variant="outline" className="text-xs bg-white">
                                  {dup.matchReason.replace('_', ' ')}
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-white">
                                  {(dup.similarityScore * 100).toFixed(0)}% match
                                </Badge>
                                {dup.distance && (
                                  <Badge variant="outline" className="text-xs bg-white">
                                    {dup.distance}m away
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {dup.duplicateVenue.city || 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="max-w-[200px] truncate">
                              {dup.duplicateVenue.address || 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            0 (moved to canonical)
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-yellow-100">
                              Merged
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No venues found</p>
          </div>
        )}
      </Card>

      {/* Merge Confirmation Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Venue Merge</DialogTitle>
            <DialogDescription>
              Review the merge details below. All events from duplicate venues will be moved to the canonical venue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-green-900 mb-2">
                ✓ Canonical Venue (will be kept):
              </h4>
              {canonicalVenue && (
                <Card className="p-3 bg-green-50 border-green-200">
                  <p className="font-medium">{canonicalVenue.name}</p>
                  <p className="text-sm text-muted-foreground">{canonicalVenue.address}</p>
                  <p className="text-sm">
                    <strong>{canonicalVenue._count?.events || 0}</strong> events
                  </p>
                </Card>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-orange-900 mb-2">
                → Duplicate Venues (will be merged):
              </h4>
              <div className="space-y-2">
                {duplicateVenues.map((venue: any) => (
                  <Card key={venue.id} className="p-3 bg-orange-50 border-orange-200">
                    <p className="font-medium">{venue.name}</p>
                    <p className="text-sm text-muted-foreground">{venue.address}</p>
                    <p className="text-sm">
                      <strong>{venue._count?.events || 0}</strong> events will be moved
                    </p>
                  </Card>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm">
                <strong>Total events after merge:</strong>{' '}
                {selectedVenuesList.reduce((sum: number, v: any) => sum + (v._count?.events || 0), 0)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMergeDialog(false)}
              disabled={mergeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMerge}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? 'Merging...' : 'Confirm Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
