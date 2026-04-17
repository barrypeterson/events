import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

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
      try {
        const analysis = await analyzeVenue(input.configId);
        return { success: true, sampleEventCount: analysis.sampleEventCount };
      } catch (err: any) {
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
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { enrichEventDetails } = await import('../../../../../../apps/agents/src/lib/event-enricher');
      const result = await enrichEventDetails(input.eventId);
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
