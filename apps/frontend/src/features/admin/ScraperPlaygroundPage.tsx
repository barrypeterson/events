import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type ScraperType = 'agent-browser' | 'playwright' | 'universal'

interface ExtractedEvent {
  title: string
  rawDate?: string
  rawTime?: string
  rawDescription?: string
  rawPrice?: string
  imageUrl?: string
  url?: string
  metadata?: Record<string, any>
}

export function ScraperPlaygroundPage() {
  const [url, setUrl] = useState('')
  const [venueName, setVenueName] = useState('')
  const [selectedScraper, setSelectedScraper] = useState<ScraperType>('universal')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [comparisonJobIds, setComparisonJobIds] = useState<Record<string, string>>({})
  const [isComparing, setIsComparing] = useState(false)

  // Fetch available scraper types
  const { data: scraperTypes } = trpc.scrapers.getScraperTypes.useQuery()

  // Start scraper mutation
  const startScraperMutation = trpc.scrapers.startScraper.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId)
      setIsComparing(false)
    },
  })

  // Compare scrapers mutation
  const compareScrapersMutation = trpc.scrapers.compareScrapers.useMutation({
    onSuccess: (data) => {
      setComparisonJobIds(data.jobIds)
      setIsComparing(true)
      setActiveJobId(null)
    },
  })

  // Poll job status
  const { data: jobStatus } = trpc.scrapers.getJobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: !!activeJobId,
      refetchInterval: (data) => {
        if (data?.state?.data?.status === 'running') return 1000
        return false
      },
    }
  )

  const handleRunScraper = () => {
    if (!url || !venueName) return
    startScraperMutation.mutate({
      url,
      venueName,
      scraperType: selectedScraper,
    })
  }

  const handleCompareAll = () => {
    if (!url || !venueName) return
    compareScrapersMutation.mutate({ url, venueName })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Scraper Playground</h1>
        <p className="text-lg text-muted-foreground">
          Test and compare event extraction from any URL
        </p>
      </div>

      {/* Input Form */}
      <Card className="mb-8 p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label htmlFor="url">URL to Scrape</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/events"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="venue">Venue Name</Label>
            <Input
              id="venue"
              placeholder="e.g., Fremont Theater"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="scraper">Scraper Type</Label>
            <Select
              value={selectedScraper}
              onValueChange={(v) => setSelectedScraper(v as ScraperType)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scraperTypes?.scrapers.map((scraper) => (
                  <SelectItem
                    key={scraper.id}
                    value={scraper.id}
                    disabled={!scraper.available}
                  >
                    <div className="flex items-center gap-2">
                      {scraper.name}
                      {!scraper.available && (
                        <Badge variant="outline" className="text-xs">
                          Unavailable
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={handleRunScraper}
            disabled={!url || !venueName || startScraperMutation.isPending}
          >
            {startScraperMutation.isPending ? 'Starting...' : 'Run Scraper'}
          </Button>
          <Button
            variant="outline"
            onClick={handleCompareAll}
            disabled={!url || !venueName || compareScrapersMutation.isPending}
          >
            {compareScrapersMutation.isPending ? 'Starting...' : 'Compare All Scrapers'}
          </Button>
        </div>

        {/* Scraper descriptions */}
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {scraperTypes?.scrapers.map((scraper) => (
            <div
              key={scraper.id}
              className={`rounded-lg border p-3 ${
                selectedScraper === scraper.id ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{scraper.name}</span>
                {!scraper.available && (
                  <Badge variant="destructive" className="text-xs">
                    Not Installed
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{scraper.description}</p>
              {scraper.unavailableReason && (
                <p className="mt-2 text-xs text-red-600">{scraper.unavailableReason}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Single Scraper Results */}
      {activeJobId && jobStatus && (
        <Card className="mb-8 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Results</h2>
              <p className="text-sm text-muted-foreground">
                {jobStatus.scraper} scraper • {jobStatus.url}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={getStatusColor(jobStatus.status)}>
                {jobStatus.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatDuration(jobStatus.durationMs)}
              </span>
            </div>
          </div>

          {jobStatus.status === 'running' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Scraping in progress...</span>
              </div>
              <div className="rounded bg-muted p-3 font-mono text-sm">
                {jobStatus.logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {jobStatus.status === 'failed' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-800">Scraper Failed</p>
              <p className="mt-1 text-sm text-red-600">{jobStatus.error}</p>
            </div>
          )}

          {jobStatus.status === 'completed' && (
            <>
              {/* Metrics */}
              {jobStatus.metrics && (
                <div className="mb-6 grid gap-4 md:grid-cols-4">
                  <MetricCard
                    label="Events Found"
                    value={jobStatus.eventCount.toString()}
                  />
                  <MetricCard
                    label="Duration"
                    value={formatDuration(jobStatus.durationMs)}
                  />
                  {jobStatus.metrics.snapshotSizeBytes !== undefined && (
                    <MetricCard
                      label="Input Size"
                      value={`${(jobStatus.metrics.snapshotSizeBytes / 1024).toFixed(1)} KB`}
                    />
                  )}
                  {jobStatus.metrics.claudeInputTokens && (
                    <MetricCard
                      label="Claude Tokens"
                      value={jobStatus.metrics.claudeInputTokens.toLocaleString()}
                    />
                  )}
                </div>
              )}

              {/* Warning for empty pages */}
              {jobStatus.eventCount === 0 && jobStatus.metrics?.snapshotSizeBytes === 0 && (
                <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="font-medium text-yellow-800">Empty Page Detected</p>
                  <p className="mt-1 text-sm text-yellow-700">
                    The page returned no content. This usually means the site has bot protection
                    or requires JavaScript that didn't load. Try a different scraper type or URL.
                  </p>
                </div>
              )}

              {/* Events Table */}
              <EventsTable events={jobStatus.events} />
            </>
          )}
        </Card>
      )}

      {/* Comparison Results */}
      {isComparing && Object.keys(comparisonJobIds).length > 0 && (
        <ComparisonResults
          jobIds={comparisonJobIds}
          formatDuration={formatDuration}
          getStatusColor={getStatusColor}
        />
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function EventsTable({ events }: { events: ExtractedEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No events extracted</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Title</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Image</TableHead>
            <TableHead>Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                <div className="max-w-[250px]">
                  <div className="truncate" title={event.title}>
                    {event.title}
                  </div>
                  {event.rawDescription && (
                    <p
                      className="mt-1 truncate text-xs text-muted-foreground"
                      title={event.rawDescription}
                    >
                      {event.rawDescription}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>{event.rawDate || '-'}</TableCell>
              <TableCell>{event.rawTime || '-'}</TableCell>
              <TableCell>{event.rawPrice || '-'}</TableCell>
              <TableCell>
                {event.imageUrl ? (
                  <a
                    href={event.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </a>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {event.url ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Link
                  </a>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Each job tracker owns its own useQuery hook — avoids hooks-in-loops */
function ComparisonJobTracker({
  scraper,
  jobId,
  onData,
}: {
  scraper: string
  jobId: string
  onData: (scraper: string, data: any) => void
}) {
  const { data } = trpc.scrapers.getJobStatus.useQuery(
    { jobId },
    {
      enabled: !!jobId,
      refetchInterval: (data) => {
        if (data?.state?.data?.status === 'running') return 1000
        return false
      },
    }
  )

  // Report data up to parent via callback
  const prevRef = useState<string | null>(null)
  if (data && JSON.stringify(data) !== prevRef[0]) {
    prevRef[1](JSON.stringify(data))
    onData(scraper, data)
  }

  return null // Render-less hook component
}

function ComparisonResults({
  jobIds,
  formatDuration,
  getStatusColor,
}: {
  jobIds: Record<string, string>
  formatDuration: (ms: number) => string
  getStatusColor: (status: string) => string
}) {
  const [results, setResults] = useState<Record<string, any>>({})

  const handleData = (scraper: string, data: any) => {
    setResults((prev) => ({ ...prev, [scraper]: data }))
  }

  const entries = Object.entries(jobIds)
  const queries = entries.map(([scraper]) => ({
    scraper,
    data: results[scraper] || null,
  }))

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-2xl font-semibold">Scraper Comparison</h2>

      {/* Mount one hook component per job */}
      {entries.map(([scraper, jobId]) => (
        <ComparisonJobTracker
          key={scraper}
          scraper={scraper}
          jobId={jobId}
          onData={handleData}
        />
      ))}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {queries.map(({ scraper }) => (
            <TabsTrigger key={scraper} value={scraper}>
              {scraper}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scraper</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Input Size</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map(({ scraper, data }) => (
                  <TableRow key={scraper}>
                    <TableCell className="font-medium">{scraper}</TableCell>
                    <TableCell>
                      {data ? (
                        <Badge className={getStatusColor(data.status)}>
                          {data.status}
                        </Badge>
                      ) : (
                        <Skeleton className="h-5 w-16" />
                      )}
                    </TableCell>
                    <TableCell>
                      {data?.status === 'completed' ? data.eventCount : '-'}
                    </TableCell>
                    <TableCell>
                      {data ? formatDuration(data.durationMs) : '-'}
                    </TableCell>
                    <TableCell>
                      {data?.metrics?.snapshotSizeBytes
                        ? `${(data.metrics.snapshotSizeBytes / 1024).toFixed(1)} KB`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {data?.metrics?.claudeInputTokens
                        ? data.metrics.claudeInputTokens.toLocaleString()
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ComparisonMatrix queries={queries} />
        </TabsContent>

        {queries.map(({ scraper, data }) => (
          <TabsContent key={scraper} value={scraper} className="mt-4">
            {data?.status === 'running' && (
              <div className="flex items-center gap-2 py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Scraping in progress...</span>
              </div>
            )}
            {data?.status === 'failed' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="font-medium text-red-800">Scraper Failed</p>
                <p className="mt-1 text-sm text-red-600">{data.error}</p>
              </div>
            )}
            {data?.status === 'completed' && (
              <EventsTable events={data.events} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

function ComparisonMatrix({
  queries,
}: {
  queries: Array<{ scraper: string; data: any }>
}) {
  // Get all unique event titles
  const allTitles = new Set<string>()
  queries.forEach(({ data }) => {
    if (data?.events) {
      data.events.forEach((e: ExtractedEvent) => allTitles.add(e.title))
    }
  })

  if (allTitles.size === 0) return null

  // Build presence matrix
  const matrix: Record<string, Record<string, boolean>> = {}
  allTitles.forEach((title) => {
    matrix[title] = {}
    queries.forEach(({ scraper, data }) => {
      matrix[title][scraper] = data?.events?.some(
        (e: ExtractedEvent) => e.title === title
      )
    })
  })

  const completedQueries = queries.filter((q) => q.data?.status === 'completed')
  if (completedQueries.length < 2) return null

  // Calculate agreement stats
  const allAgree = Array.from(allTitles).filter((title) =>
    completedQueries.every((q) => matrix[title][q.scraper])
  )
  const someAgree = Array.from(allTitles).filter((title) => {
    const found = completedQueries.filter((q) => matrix[title][q.scraper]).length
    return found > 0 && found < completedQueries.length
  })

  return (
    <div className="mt-6">
      <h3 className="mb-3 font-semibold">Event Detection Comparison</h3>

      <div className="mb-4 flex gap-4">
        <div className="rounded-lg border bg-green-50 px-4 py-2">
          <span className="text-sm text-green-800">
            Found by all: <strong>{allAgree.length}</strong>
          </span>
        </div>
        <div className="rounded-lg border bg-yellow-50 px-4 py-2">
          <span className="text-sm text-yellow-800">
            Found by some: <strong>{someAgree.length}</strong>
          </span>
        </div>
        <div className="rounded-lg border bg-muted px-4 py-2">
          <span className="text-sm text-muted-foreground">
            Total unique: <strong>{allTitles.size}</strong>
          </span>
        </div>
      </div>

      <div className="max-h-[400px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">Event</TableHead>
              {completedQueries.map(({ scraper }) => (
                <TableHead key={scraper} className="text-center">
                  {scraper}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from(allTitles)
              .sort()
              .map((title) => (
                <TableRow key={title}>
                  <TableCell className="sticky left-0 bg-background">
                    <div className="max-w-[300px] truncate" title={title}>
                      {title}
                    </div>
                  </TableCell>
                  {completedQueries.map(({ scraper }) => (
                    <TableCell key={scraper} className="text-center">
                      {matrix[title][scraper] ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
