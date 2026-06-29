import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Copy,
  Check,
  Sparkles,
  FileText,
  Ticket,
} from 'lucide-react'

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline" className="text-xs">Never run</Badge>
  switch (status) {
    case 'SUCCESS': return <Badge className="bg-green-100 text-green-700 text-xs">Success</Badge>
    case 'PARTIAL': return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Partial</Badge>
    case 'FAILED': return <Badge variant="destructive" className="text-xs">Failed</Badge>
    case 'RUNNING': return <Badge className="bg-blue-100 text-blue-700 text-xs">Running</Badge>
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
}

// Kept in sync with TICKET_PROVIDER_DOMAINS in
// apps/agents/src/lib/event-enricher.ts and
// apps/backend/src/api/trpc/routes/venue-scraping.ts — hosts the enricher
// will skip outright. This copy lets us label skip predictions client-side
// without an extra round-trip. If the list moves, update all three.
const TICKET_PROVIDER_HOSTS = new Set([
  'ticketmaster.com', 'www.ticketmaster.com',
  'axs.com', 'www.axs.com',
  'eventbrite.com', 'www.eventbrite.com',
  'prekindle.com', 'www.prekindle.com',
  'seetickets.us', 'www.seetickets.us',
  'etix.com', 'www.etix.com',
  'dice.fm', 'www.dice.fm',
  'livenation.com', 'www.livenation.com',
  'stubhub.com', 'www.stubhub.com',
  'vividseats.com', 'www.vividseats.com',
])

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

type EnrichmentPrediction =
  | { kind: 'enriched' }
  | { kind: 'eligible'; via: 'detail' | 'ticket' }
  | { kind: 'skipped'; reason: 'no_url' | 'third_party_ticket_only'; host?: string }

function predictEnrichment(event: {
  detailUrl: string | null
  ticketUrl: string | null
  metadata: unknown
}): EnrichmentPrediction {
  const meta = (event.metadata as any) || {}
  if (meta.enrichedAt) return { kind: 'enriched' }
  if (event.detailUrl) return { kind: 'eligible', via: 'detail' }
  if (event.ticketUrl) {
    const host = hostOf(event.ticketUrl)
    if (host && TICKET_PROVIDER_HOSTS.has(host)) {
      return { kind: 'skipped', reason: 'third_party_ticket_only', host }
    }
    return { kind: 'eligible', via: 'ticket' }
  }
  return { kind: 'skipped', reason: 'no_url' }
}

function Timestamp({ date }: { date: string | Date | null | undefined }) {
  if (!date) return <span className="text-muted-foreground">—</span>
  const d = typeof date === 'string' ? new Date(date) : date
  return <span title={d.toISOString()}>{d.toLocaleString()}</span>
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
    </Button>
  )
}

function Disclosure({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-muted/50"
      >
        <span>{label}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  )
}

export function VenueScrapingDetailPage() {
  const { configId = '' } = useParams<{ configId: string }>()

  const configQuery = trpc.venueScraping.getConfig.useQuery({ configId }, { enabled: !!configId })
  const runsQuery = trpc.venueScraping.listRuns.useQuery({ configId, limit: 10 }, { enabled: !!configId })
  const enrichPreview = trpc.venueScraping.enrichmentPreview.useQuery({
    venueId: configQuery.data?.venueId,
    limit: 100,
  }, { enabled: !!configQuery.data?.venueId })
  const eventsQuery = trpc.venueScraping.listVenueEvents.useQuery({
    venueId: configQuery.data?.venueId || '',
    limit: 100,
  }, { enabled: !!configQuery.data?.venueId })

  const analyzeMutation = trpc.venueScraping.analyzeVenue.useMutation({
    onSuccess: () => { configQuery.refetch(); runsQuery.refetch() },
  })
  const refreshMutation = trpc.venueScraping.refreshVenue.useMutation({
    onSuccess: () => { configQuery.refetch(); runsQuery.refetch(); eventsQuery.refetch() },
  })
  const setProxyMutation = trpc.venueScraping.setRequiresProxy.useMutation({
    onSuccess: () => { configQuery.refetch() },
  })

  if (configQuery.isLoading) {
    return (
      <div className="container py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!configQuery.data) {
    return (
      <div className="container py-8">
        <Link to="/admin/venue-scraping" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline h-3 w-3" /> Back
        </Link>
        <p className="mt-4 text-destructive">Config not found.</p>
      </div>
    )
  }

  const config = configQuery.data
  const analysis = (config.pageAnalysis as any) || {}
  const extractionPrompt: string = analysis.extractionPrompt || ''
  const sampleTitles: string[] = Array.isArray(analysis.sampleTitles) ? analysis.sampleTitles : []

  return (
    <div className="container py-8 space-y-6">
      <Link to="/admin/venue-scraping" className="text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 inline h-3 w-3" /> Back to venue scraping
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{config.venue?.name || config.sourceName}</h1>
          <p className="text-sm text-muted-foreground">{config.sourceName}</p>
          <a
            href={config.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {config.sourceUrl}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeMutation.mutate({ configId })}
            disabled={analyzeMutation.isPending || refreshMutation.isPending}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
            {analyzeMutation.isPending ? 'Analyzing…' : 'Re-analyze'}
          </Button>
          <Button
            size="sm"
            onClick={() => refreshMutation.mutate({ configId })}
            disabled={analyzeMutation.isPending || refreshMutation.isPending || !config.pageAnalysis}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshMutation.isPending ? 'Refreshing…' : 'Refresh now'}
          </Button>
        </div>
      </div>

      {/* Config summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div><div className="text-muted-foreground text-xs">Status</div><StatusBadge status={config.lastRefreshStatus} /></div>
          <div><div className="text-muted-foreground text-xs">Scraping</div><Badge variant={config.scrapingEnabled ? 'default' : 'outline'} className="text-xs">{config.scrapingEnabled ? 'Enabled' : 'Disabled'}</Badge></div>
          <div>
            <div className="text-muted-foreground text-xs">Requires proxy</div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={config.requiresProxy}
                onClick={() => setProxyMutation.mutate({ configId, requiresProxy: !config.requiresProxy })}
                disabled={setProxyMutation.isPending}
                title="Toggle whether this venue is scraped through the proxy"
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  config.requiresProxy ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    config.requiresProxy ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs font-medium">
                {setProxyMutation.isPending ? 'Saving…' : config.requiresProxy ? 'Yes' : 'No'}
              </span>
            </div>
            {setProxyMutation.error && (
              <div className="mt-1 text-xs text-destructive">
                Couldn't update: {setProxyMutation.error.message}
              </div>
            )}
          </div>
          <div><div className="text-muted-foreground text-xs">Schedule</div><code className="text-xs">{config.schedule}</code></div>
          <div><div className="text-muted-foreground text-xs">Last analyzed</div><Timestamp date={config.analyzedAt} /></div>
          <div><div className="text-muted-foreground text-xs">Last refreshed</div><Timestamp date={config.lastRefreshedAt} /></div>
          <div><div className="text-muted-foreground text-xs">Page type</div><span>{analysis.pageType || '—'}</span></div>
          <div><div className="text-muted-foreground text-xs">Sample events</div><span>{analysis.sampleEventCount ?? '—'}</span></div>
        </CardContent>
      </Card>

      {/* Page analysis + extraction prompt */}
      {config.pageAnalysis ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Page analysis</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {analysis.pageDescription && (
              <p className="text-sm text-muted-foreground">{analysis.pageDescription}</p>
            )}
            {sampleTitles.length > 0 && (
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Sample titles detected</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {sampleTitles.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            <Disclosure label="Extraction prompt (fed to gpt-4o-mini on every refresh)">
              <div className="mb-2 flex justify-end"><CopyButton value={extractionPrompt} /></div>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">{extractionPrompt || '(none)'}</pre>
            </Disclosure>
            <Disclosure label="Full pageAnalysis JSON">
              <pre className="overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(analysis, null, 2)}</pre>
            </Disclosure>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            <AlertCircle className="mb-2 h-4 w-4" />
            This venue hasn't been analyzed yet. Click <em>Re-analyze</em> to generate the extraction prompt.
          </CardContent>
        </Card>
      )}

      {/* Scraper runs */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent scraper runs</CardTitle></CardHeader>
        <CardContent>
          {runsQuery.isLoading && <Skeleton className="h-20 w-full" />}
          {runsQuery.data && runsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          )}
          {runsQuery.data && runsQuery.data.length > 0 && (
            <table className="w-full border-separate border-spacing-x-4 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">Started</th>
                  <th className="font-normal">Status</th>
                  <th className="text-right font-normal">Found</th>
                  <th className="text-right font-normal">New</th>
                  <th className="text-right font-normal">Updated</th>
                  <th className="text-right font-normal">Duration</th>
                  <th className="font-normal">Error</th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.data.map(run => {
                  const duration = run.completedAt && run.startedAt
                    ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                    : '—'
                  return (
                    <tr key={run.id} className="border-t">
                      <td className="py-2"><Timestamp date={run.startedAt} /></td>
                      <td><StatusBadge status={run.status} /></td>
                      <td className="text-right tabular-nums">{run.eventsFound}</td>
                      <td className="text-right tabular-nums text-green-600">{run.eventsNew}</td>
                      <td className="text-right tabular-nums text-blue-600">{run.eventsUpdated}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{duration}</td>
                      <td className="max-w-xs truncate text-xs text-destructive" title={run.errorMessage || ''}>
                        {run.errorMessage || ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Enrichment preview for this venue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Enrichment preview
            {enrichPreview.data && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {enrichPreview.data.eligible.length} eligible • {enrichPreview.data.skipped.length} skipped
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrichPreview.isLoading && <Skeleton className="h-20 w-full" />}
          {enrichPreview.data && enrichPreview.data.eligible.length === 0 && enrichPreview.data.skipped.length === 0 && (
            <p className="text-sm text-muted-foreground">No events need enrichment.</p>
          )}
          {enrichPreview.data && enrichPreview.data.eligible.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-green-700">Will enrich</div>
              <ul className="space-y-1 text-xs">
                {enrichPreview.data.eligible.map(e => (
                  <li key={e.id} className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="truncate text-muted-foreground">
                        <Badge variant="outline" className="mr-1 text-[10px]">{e.urlSource}</Badge>
                        {e.urlToUse}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {enrichPreview.data && enrichPreview.data.skipped.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Will skip</div>
              <ul className="space-y-1 text-xs">
                {enrichPreview.data.skipped.map(e => (
                  <li key={e.id} className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{e.title}</div>
                      <div className="text-muted-foreground">
                        <Badge variant="outline" className="mr-1 text-[10px]">{e.reason}</Badge>
                        {e.host && <span>{e.host}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events with raw vs processed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Events
            {eventsQuery.data && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {eventsQuery.data.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading && <Skeleton className="h-20 w-full" />}
          {eventsQuery.data && eventsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No events yet. Trigger a refresh.</p>
          )}
          {eventsQuery.data && eventsQuery.data.map(event => (
            <EventRow
              key={event.id}
              event={event as any}
              onAfterEnrich={() => { eventsQuery.refetch(); enrichPreview.refetch() }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function EventRow({ event, onAfterEnrich }: {
  event: {
    id: string
    title: string
    description: string | null
    startDateTime: string | Date
    category: string[]
    images: string[]
    ticketUrl: string | null
    detailUrl: string | null
    metadata: unknown
    sources?: Array<{ id: string; sourceUrl: string; scrapedAt: string | Date; rawData: unknown }>
  }
  onAfterEnrich: () => void
}) {
  const [open, setOpen] = useState(false)
  const meta = (event.metadata as any) || {}
  const enriched = !!meta.enrichedAt
  const rawSource = event.sources?.[0]

  const enrichMutation = trpc.venueScraping.enrichEvent.useMutation({
    onSuccess: () => onAfterEnrich(),
  })

  const result = enrichMutation.data
  const skipReason = result && !result.success ? result.reason : null
  const skipDetail = result && !result.success ? (result as any).detail : null
  const prediction = predictEnrichment(event)

  return (
    <div className="border-b last:border-0">
      <div className="flex w-full items-start justify-between gap-4 py-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-start text-left hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="truncate font-medium">{event.title}</span>
            </div>
            <div className="ml-5 mt-0.5 text-xs text-muted-foreground">
              <Timestamp date={event.startDateTime} />
              {event.category?.length > 0 && <span className="ml-2">{event.category.join(', ')}</span>}

              {/* URL presence icons — click through to see the target. */}
              {event.detailUrl && (
                <a
                  href={event.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-2 inline-flex items-center gap-0.5 text-emerald-700 hover:underline"
                  title={`detailUrl: ${event.detailUrl}`}
                >
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[200px] truncate">{hostOf(event.detailUrl) || 'detail'}</span>
                </a>
              )}
              {event.ticketUrl && (
                <a
                  href={event.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-2 inline-flex items-center gap-0.5 text-slate-600 hover:underline"
                  title={`ticketUrl: ${event.ticketUrl}`}
                >
                  <Ticket className="h-3 w-3" />
                  <span className="max-w-[200px] truncate">{hostOf(event.ticketUrl) || 'ticket'}</span>
                </a>
              )}

              {/* Current enrichment state — shown BEFORE the user clicks. */}
              {prediction.kind === 'enriched' && (
                <Badge className="ml-2 bg-green-100 text-green-700 text-[10px]">Enriched</Badge>
              )}
              {prediction.kind === 'eligible' && (
                <Badge variant="outline" className="ml-2 text-[10px]" title={`Will enrich via ${prediction.via}Url`}>
                  Eligible · {prediction.via}
                </Badge>
              )}
              {prediction.kind === 'skipped' && (
                <Badge
                  variant="outline"
                  className="ml-2 text-[10px] border-amber-300 bg-amber-50 text-amber-800"
                  title={
                    prediction.reason === 'third_party_ticket_only'
                      ? `Only ticket URL is on ${prediction.host}, which blocks scrapers. Add a detailUrl (venue's own page) by re-running refresh after re-analyze.`
                      : 'This event has no scrapable URL (neither detailUrl nor ticketUrl).'
                  }
                >
                  Would skip · {prediction.reason}{prediction.host ? ` · ${prediction.host}` : ''}
                </Badge>
              )}

              {/* Actual outcome after clicking the Enrich button. */}
              {skipReason && (
                <Badge
                  variant="destructive"
                  className="ml-2 text-[10px]"
                  title={skipDetail || undefined}
                >
                  Skipped · {skipReason}{skipDetail ? ` · ${skipDetail}` : ''}
                </Badge>
              )}
            </div>
          </div>
        </button>
        <Button
          variant="ghost"
          size="sm"
          disabled={enrichMutation.isPending}
          onClick={() => enrichMutation.mutate({ eventId: event.id, force: enriched })}
          title={
            enriched
              ? 'Re-enrich: ignore the already_enriched flag and overwrite description, lineup, door time, age'
              : 'Fetch the detail page and fill in description, lineup, door time, age'
          }
        >
          <Sparkles className={`h-3.5 w-3.5 ${enrichMutation.isPending ? 'animate-pulse' : ''}`} />
          <span className="ml-1 text-xs">
            {enrichMutation.isPending ? (enriched ? 'Re-enriching…' : 'Enriching…')
              : enrichMutation.data
                ? (enrichMutation.data.success ? 'Enriched ✓' : 'Skipped')
                : enriched ? 'Re-enrich' : 'Enrich'}
          </span>
        </Button>
      </div>
      {open && (
        <div className="ml-5 mb-2 grid gap-3 pb-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium">Processed (DB)</div>
            <pre className="overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify({
              id: event.id,
              title: event.title,
              description: event.description,
              startDateTime: event.startDateTime,
              category: event.category,
              images: event.images,
              ticketUrl: event.ticketUrl,
              detailUrl: event.detailUrl,
              metadata: meta,
            }, null, 2)}</pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">Raw (most recent EventSource)</div>
            {rawSource ? (
              <pre className="overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(rawSource.rawData, null, 2)}</pre>
            ) : (
              <p className="text-xs text-muted-foreground">No source record.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
