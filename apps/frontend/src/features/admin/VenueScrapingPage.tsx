import { useEffect, useState } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Play,
  Search,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Pencil,
  Check,
  X,
} from 'lucide-react'

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline" className="text-xs">Never run</Badge>
  switch (status) {
    case 'SUCCESS': return <Badge className="bg-green-100 text-green-700 text-xs">Success</Badge>
    case 'PARTIAL': return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Partial</Badge>
    case 'FAILED': return <Badge variant="destructive" className="text-xs">Failed</Badge>
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
}

function ElapsedSeconds({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.floor((now - startedAt) / 1000)
  return <>{secs}s</>
}

function TimeAgo({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-xs text-muted-foreground">Never</span>
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  let text = ''
  if (diffMin < 1) text = 'just now'
  else if (diffMin < 60) text = `${diffMin}m ago`
  else if (diffHr < 24) text = `${diffHr}h ago`
  else text = `${diffDay}d ago`

  return <span className="text-xs text-muted-foreground">{text}</span>
}

export function VenueScrapingPage() {
  const [activeAction, setActiveAction] = useState<{ id: string; type: 'analyze' | 'refresh'; startedAt: number } | null>(null)
  const [editingUrl, setEditingUrl] = useState<{ id: string; url: string } | null>(null)
  const configs = trpc.venueScraping.listConfigs.useQuery()
  const toggleMutation = trpc.venueScraping.toggleScraping.useMutation({
    onSuccess: () => configs.refetch(),
  })
  const analyzeMutation = trpc.venueScraping.analyzeVenue.useMutation({
    onSuccess: () => { setActiveAction(null); configs.refetch(); },
    onError: () => setActiveAction(null),
  })
  const refreshMutation = trpc.venueScraping.refreshVenue.useMutation({
    onSuccess: () => { setActiveAction(null); configs.refetch(); },
    onError: () => setActiveAction(null),
  })
  const triggerAllMutation = trpc.venueScraping.triggerAll.useMutation({
    onSuccess: () => configs.refetch(),
  })
  const enrichAllMutation = trpc.venueScraping.enrichAll.useMutation()
  const updateUrlMutation = trpc.venueScraping.updateUrl.useMutation({
    onSuccess: () => { setEditingUrl(null); configs.refetch(); },
  })

  const analyzed = configs.data?.filter((c: any) => c.pageAnalysis) || []
  const enabled = configs.data?.filter((c: any) => c.scrapingEnabled) || []

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Venue Scraping</h1>
          <p className="text-muted-foreground">
            Manage venue scrapers. Analyze a venue first, then enable scraping.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => triggerAllMutation.mutate()}
            disabled={triggerAllMutation.isPending || enabled.length === 0}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${triggerAllMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh All ({enabled.length})
          </Button>
          <Button
            variant="outline"
            onClick={() => enrichAllMutation.mutate({})}
            disabled={enrichAllMutation.isPending}
          >
            {enrichAllMutation.isPending ? (
              <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Enriching...</>
            ) : enrichAllMutation.data ? (
              <>{enrichAllMutation.data.enriched} enriched</>
            ) : (
              <>Enrich Events</>
            )}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{configs.data?.length || 0}</div>
            <p className="text-sm text-muted-foreground">Total Venues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{analyzed.length}</div>
            <p className="text-sm text-muted-foreground">Analyzed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{enabled.length}</div>
            <p className="text-sm text-muted-foreground">Scraping Enabled</p>
          </CardContent>
        </Card>
      </div>

      {configs.isLoading && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      )}

      {configs.data && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venue</TableHead>
                <TableHead>Source URL</TableHead>
                <TableHead>Analyzed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.data.map((config: any) => {
                const hasAnalysis = !!config.pageAnalysis
                const analysis = config.pageAnalysis as any

                return (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      {config.venue?.name || config.sourceName}
                    </TableCell>
                    <TableCell>
                      {editingUrl?.id === config.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 text-xs"
                            value={editingUrl.url}
                            onChange={(e) => setEditingUrl({ ...editingUrl, url: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') updateUrlMutation.mutate({ configId: config.id, sourceUrl: editingUrl.url })
                              if (e.key === 'Escape') setEditingUrl(null)
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateUrlMutation.mutate({ configId: config.id, sourceUrl: editingUrl.url })}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditingUrl(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <a
                            href={config.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {new URL(config.sourceUrl).hostname}
                            <ExternalLink className="ml-1 inline h-3 w-3" />
                          </a>
                          <button
                            onClick={() => setEditingUrl({ id: config.id, url: config.sourceUrl })}
                            className="ml-1 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {activeAction && activeAction.id === config.id && activeAction.type === 'analyze' ? (
                        <div className="flex items-center gap-1">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span className="text-xs text-primary">
                            Analyzing… <ElapsedSeconds startedAt={activeAction.startedAt} />
                          </span>
                        </div>
                      ) : hasAnalysis ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs text-muted-foreground">
                            {analysis?.sampleEventCount || '?'} events
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span className="text-xs">Not analyzed</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {activeAction && activeAction.id === config.id && activeAction.type === 'refresh' ? (
                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                          <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> Running <ElapsedSeconds startedAt={activeAction.startedAt} />
                        </Badge>
                      ) : (
                        <StatusBadge status={config.lastRefreshStatus} />
                      )}
                    </TableCell>
                    <TableCell>
                      <TimeAgo date={config.lastRefreshedAt} />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleMutation.mutate({
                          configId: config.id,
                          enabled: !config.scrapingEnabled,
                        })}
                        disabled={toggleMutation.isPending}
                        className="disabled:opacity-30"
                      >
                        {config.scrapingEnabled ? (
                          <ToggleRight className="h-6 w-6 text-primary" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveAction({ id: config.id, type: 'analyze', startedAt: Date.now() })
                            analyzeMutation.mutate({ configId: config.id })
                          }}
                          disabled={!!activeAction}
                          title="Analyze page structure"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveAction({ id: config.id, type: 'refresh', startedAt: Date.now() })
                            refreshMutation.mutate({ configId: config.id })
                          }}
                          disabled={!hasAnalysis || !!activeAction}
                          title={!hasAnalysis ? 'Analyze first' : 'Refresh events now'}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
