import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

// Kept in sync with event-enricher.ts TICKET_PROVIDER_DOMAINS so preview
// matches reality. If these diverge a preview lies; reference a single source
// if this list grows.
const TICKET_PROVIDER_DOMAINS = new Set([
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
]);

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const venueScrapingRouter = router({
  /**
   * List all scraper configs with venue info
   */
  listConfigs: publicProcedure.query(async () => {
    const { prisma } = await import('@slo-events/database');
    const configs = await prisma.venueScraperConfig.findMany({
      include: { venue: { select: { id: true, name: true, city: true, venueType: true } } },
      orderBy: { sourceName: 'asc' },
    });
    return configs;
  }),

  /**
   * Get one scraper config with full pageAnalysis (for the admin detail view).
   */
  getConfig: publicProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      const config = await prisma.venueScraperConfig.findUnique({
        where: { id: input.configId },
        include: { venue: true },
      });
      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });
      }
      return config;
    }),

  /**
   * List recent scraper runs for a venue. Filters by sourceName since ScraperRun
   * isn't relationally linked to config — it only carries sourceName/sourceUrl.
   */
  listRuns: publicProcedure
    .input(z.object({
      configId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      const config = await prisma.venueScraperConfig.findUnique({
        where: { id: input.configId },
        select: { sourceName: true },
      });
      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });
      }
      return prisma.scraperRun.findMany({
        where: { sourceName: config.sourceName },
        orderBy: { startedAt: 'desc' },
        take: input.limit,
      });
    }),

  /**
   * List events for a venue with their sources (raw scraped payload), so the
   * admin can compare raw vs processed side-by-side.
   */
  listVenueEvents: publicProcedure
    .input(z.object({
      venueId: z.string().uuid(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      return prisma.event.findMany({
        where: { venueId: input.venueId, status: 'ACTIVE' },
        orderBy: { startDateTime: 'asc' },
        take: input.limit,
        include: {
          sources: {
            orderBy: { scrapedAt: 'desc' },
            take: 3,
          },
        },
      });
    }),

  /**
   * Preview what the next enrichment run will do, WITHOUT mutating anything.
   * Uses the same filter logic as event-enricher.enrichUnenrichedEvents so the
   * preview can't drift from reality.
   */
  enrichmentPreview: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      venueId: z.string().uuid().optional(),
    }).optional().default({}))
    .query(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');

      // Same WHERE clause as enrichUnenrichedEvents, widened to also return
      // events that would be SKIPPED so the admin sees the full picture.
      const candidates = await prisma.event.findMany({
        where: {
          status: 'ACTIVE',
          AND: [
            {
              OR: [
                { detailUrl: { not: null } },
                { ticketUrl: { not: null } },
              ],
            },
            {
              OR: [
                { description: null },
                { description: '' },
              ],
            },
          ],
          ...(input.venueId ? { venueId: input.venueId } : {}),
        },
        select: {
          id: true,
          title: true,
          detailUrl: true,
          ticketUrl: true,
          metadata: true,
          startDateTime: true,
          venue: { select: { id: true, name: true } },
        },
        orderBy: { startDateTime: 'asc' },
        take: input.limit,
      });

      const eligible: Array<{
        id: string;
        title: string;
        venueName: string;
        startDateTime: Date;
        urlToUse: string;
        urlSource: 'detail' | 'ticket';
      }> = [];
      const skipped: Array<{
        id: string;
        title: string;
        venueName: string;
        startDateTime: Date;
        reason: 'already_enriched' | 'no_url' | 'third_party_ticket_only';
        host?: string;
      }> = [];

      for (const e of candidates) {
        const meta = (e.metadata as any) || {};
        const venueName = e.venue?.name || 'Unknown';
        const base = { id: e.id, title: e.title, venueName, startDateTime: e.startDateTime };

        if (meta.enrichedAt) {
          skipped.push({ ...base, reason: 'already_enriched' });
          continue;
        }
        if (e.detailUrl) {
          eligible.push({ ...base, urlToUse: e.detailUrl, urlSource: 'detail' });
          continue;
        }
        if (e.ticketUrl) {
          const host = hostnameOf(e.ticketUrl);
          if (host && TICKET_PROVIDER_DOMAINS.has(host)) {
            skipped.push({ ...base, reason: 'third_party_ticket_only', host });
            continue;
          }
          eligible.push({ ...base, urlToUse: e.ticketUrl, urlSource: 'ticket' });
          continue;
        }
        skipped.push({ ...base, reason: 'no_url' });
      }

      return { eligible, skipped, total: candidates.length };
    }),

  /**
   * Create or update a scraper config for a venue
   */
  upsertConfig: publicProcedure
    .input(z.object({
      venueId: z.string().uuid(),
      sourceUrl: z.string().url(),
      sourceName: z.string().min(1).max(100),
      scrapingEnabled: z.boolean().default(false),
      schedule: z.string().default('0 */6 * * *'),
    }))
    .mutation(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      const config = await prisma.venueScraperConfig.upsert({
        where: { sourceName: input.sourceName },
        create: input,
        update: {
          sourceUrl: input.sourceUrl,
          scrapingEnabled: input.scrapingEnabled,
          schedule: input.schedule,
        },
        include: { venue: true },
      });
      return config;
    }),

  /**
   * Toggle scraping enabled/disabled
   */
  updateUrl: publicProcedure
    .input(z.object({ configId: z.string().uuid(), sourceUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      // Clear old analysis since the page changed
      return prisma.venueScraperConfig.update({
        where: { id: input.configId },
        data: {
          sourceUrl: input.sourceUrl,
          pageAnalysis: null,
          analyzedAt: null,
        },
      });
    }),

  /**
   * Manually set or clear the proxy flag for a venue. Auto-escalation will
   * flip it to true on block detection; this lets an admin pre-set it or
   * reset after a transient block has cleared.
   */
  setRequiresProxy: publicProcedure
    .input(z.object({ configId: z.string().uuid(), requiresProxy: z.boolean() }))
    .mutation(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      return prisma.venueScraperConfig.update({
        where: { id: input.configId },
        data: {
          requiresProxy: input.requiresProxy,
          proxyEscalatedAt: input.requiresProxy ? new Date() : null,
        },
      });
    }),

  toggleScraping: publicProcedure
    .input(z.object({ configId: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const { prisma } = await import('@slo-events/database');
      const updated = await prisma.venueScraperConfig.update({
        where: { id: input.configId },
        data: { scrapingEnabled: input.enabled },
        include: { venue: true },
      });

      // When disabling, delete all events from this venue
      if (!input.enabled) {
        const venueId = updated.venueId;
        await prisma.eventSource.deleteMany({ where: { event: { venueId } } });
        await prisma.eventDuplicate.deleteMany({
          where: { OR: [{ canonicalEvent: { venueId } }, { duplicateEvent: { venueId } }] },
        });
        await prisma.event.deleteMany({ where: { venueId } });
      }

      return updated;
    }),

  /**
   * Analyze a venue's page structure (runs directly, not queued)
   */
  analyzeVenue: publicProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // Dynamic import to avoid loading Playwright in the backend at startup
      const { analyzeVenue } = await import('../../../../../../apps/agents/src/scrapers/venue-analyzer');
      const { logger } = await import('../../../lib/logger');
      const handlerStart = Date.now();
      logger.info(`[trpc] analyzeVenue handler START configId=${input.configId}`);
      try {
        const analysis = await analyzeVenue(input.configId);
        const handlerMs = Date.now() - handlerStart;
        logger.info(
          `[trpc] analyzeVenue handler END configId=${input.configId} ms=${handlerMs} sample_events=${analysis.sampleEventCount}`,
        );
        return { success: true, sampleEventCount: analysis.sampleEventCount };
      } catch (err: any) {
        logger.error(
          `[trpc] analyzeVenue handler ERROR configId=${input.configId} ms=${Date.now() - handlerStart} error="${err?.message || err}"`,
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Analysis failed: ${err.message}`,
        });
      }
    }),

  /**
   * Refresh a venue's events (runs directly, not queued)
   */
  refreshVenue: publicProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { refreshVenue } = await import('../../../../../../apps/agents/src/scrapers/venue-refresher');
      try {
        const stats = await refreshVenue(input.configId);
        return { success: true, stats };
      } catch (err: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Refresh failed: ${err.message}`,
        });
      }
    }),

  /**
   * Refresh all enabled + analyzed venues
   */
  triggerAll: publicProcedure.mutation(async () => {
    const { prisma } = await import('@slo-events/database');
    const { refreshVenue } = await import('../../../../../../apps/agents/src/scrapers/venue-refresher');

    const configs = await prisma.venueScraperConfig.findMany({
      where: { scrapingEnabled: true, pageAnalysis: { not: null } },
    });

    let succeeded = 0;
    let failed = 0;

    for (const config of configs) {
      try {
        await refreshVenue(config.id);
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { success: true, succeeded, failed, total: configs.length };
  }),

  /**
   * Enrich a single event with detail page data
   */
  enrichEvent: publicProcedure
    .input(z.object({
      eventId: z.string().uuid(),
      force: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const { enrichEventDetails } = await import('../../../../../../apps/agents/src/lib/event-enricher');
      const result = await enrichEventDetails(input.eventId, { force: input.force });
      return { success: result };
    }),

  /**
   * Enrich all events that have URLs but no description
   */
  enrichAll: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional().default({}))
    .mutation(async ({ input }) => {
      const { enrichUnenrichedEvents } = await import('../../../../../../apps/agents/src/lib/event-enricher');
      const result = await enrichUnenrichedEvents(input.limit);
      return result;
    }),
});
