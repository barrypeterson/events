import { prisma } from '@slo-events/database';
import {
  ScraperAgent,
  RawEvent,
  NormalizedEvent,
  ScraperStats,
  ScraperStatus,
  DuplicateResult,
} from '../types';
import { normalizeEvent } from '../lib/normalizer';
import { generateEmbedding } from '../lib/embeddings';
import { deduplicateEvent } from '../lib/deduplicator';
import { matchOrCreateVenue } from '../lib/venue-matcher';
import { logger, rateLimiter } from '../lib/scraper-utils';

/**
 * Abstract base class for all venue scrapers
 */
export abstract class BaseScraper implements ScraperAgent {
  abstract name: string;
  abstract sourceUrl: string;
  abstract schedule: string;

  protected rateLimitMs: number = 5000; // 5 seconds between requests
  protected timeout: number = 60000; // 60 seconds
  protected maxRetries: number = 3;

  /**
   * Scrape raw event data from source
   * Must be implemented by each venue scraper
   */
  abstract scrape(): Promise<RawEvent[]>;

  /**
   * Normalize raw event using Claude AI
   */
  async normalize(raw: RawEvent): Promise<NormalizedEvent> {
    await rateLimiter.waitIfNeeded(this.name, 1000); // Rate limit Claude calls
    return normalizeEvent(raw, this.name, this.sourceUrl);
  }

  /**
   * Check for duplicates using pgvector similarity
   */
  async deduplicate(event: NormalizedEvent): Promise<DuplicateResult> {
    // Generate embedding
    const embedding = await generateEmbedding(event);

    // Add embedding to event
    event.embedding = embedding;

    // Deduplicate and return full result (includes action)
    return deduplicateEvent(event, embedding);
  }

  /**
   * Main execution: scrape → normalize → deduplicate
   */
  async run(): Promise<ScraperStats> {
    const startTime = Date.now();
    const stats: ScraperStats = {
      eventsFound: 0,
      eventsNew: 0,
      eventsUpdated: 0,
      eventsDuplicate: 0,
      eventsFlagged: 0,
      errors: 0,
      duration: 0,
    };

    let scraperRun: any = null;

    try {
      logger.info(`Starting scraper: ${this.name}`);

      // Create scraper run record
      scraperRun = await prisma.scraperRun.create({
        data: {
          sourceName: this.name,
          sourceUrl: this.sourceUrl,
          status: ScraperStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      // Step 1: Scrape raw data
      logger.info(`[${this.name}] Scraping events...`);
      await rateLimiter.waitIfNeeded(this.name, this.rateLimitMs);

      const rawEvents = await this.scrape();
      stats.eventsFound = rawEvents.length;

      logger.info(`[${this.name}] Found ${rawEvents.length} raw events`);

      if (rawEvents.length === 0) {
        await this.updateScraperRun(scraperRun.id, ScraperStatus.SUCCESS, stats);
        return stats;
      }

      // Step 2: Normalize events
      logger.info(`[${this.name}] Normalizing events...`);
      const normalized: NormalizedEvent[] = [];

      for (const raw of rawEvents) {
        try {
          const norm = await this.normalize(raw);

          // Match venue
          const venueMatch = await matchOrCreateVenue(norm.venueName);
          norm.venueId = venueMatch.venueId;

          normalized.push(norm);
        } catch (error: any) {
          logger.error(
            `[${this.name}] Failed to normalize event: ${raw.title}`,
            error
          );
          stats.errors++;
        }
      }

      logger.info(
        `[${this.name}] Normalized ${normalized.length}/${rawEvents.length} events`
      );

      // Step 3: Deduplicate and save
      logger.info(`[${this.name}] Deduplicating events...`);

      for (const event of normalized) {
        try {
          const result = await this.deduplicate(event);

          if (result.action === 'create') {
            stats.eventsNew++;
          } else if (result.action === 'merge' || result.action === 'update') {
            stats.eventsUpdated++;
          } else if (result.action === 'flag') {
            stats.eventsFlagged++;
            stats.eventsNew++; // Flagged events are still created
          } else {
            stats.eventsDuplicate++;
          }

          logger.debug(`[${this.name}] Processed: ${event.title} (${result.action})`);
        } catch (error: any) {
          logger.error(
            `[${this.name}] Failed to deduplicate event: ${event.title}`,
            error
          );
          stats.errors++;
        }
      }

      // Calculate duration
      stats.duration = Date.now() - startTime;

      // Update scraper run
      const status =
        stats.errors === 0
          ? ScraperStatus.SUCCESS
          : stats.errors < rawEvents.length
          ? ScraperStatus.PARTIAL
          : ScraperStatus.FAILED;

      await this.updateScraperRun(scraperRun.id, status, stats);

      logger.info(
        `[${this.name}] Completed: ${stats.eventsNew} new, ${stats.eventsUpdated} updated, ${stats.eventsDuplicate} duplicates, ${stats.eventsFlagged} flagged, ${stats.errors} errors (${(stats.duration / 1000).toFixed(1)}s)`
      );

      return stats;
    } catch (error: any) {
      logger.error(`[${this.name}] Scraper failed: ${error.message}`, error);

      stats.duration = Date.now() - startTime;
      stats.errors++;

      if (scraperRun) {
        await this.updateScraperRun(
          scraperRun.id,
          ScraperStatus.FAILED,
          stats,
          error.message
        );
      }

      throw error;
    }
  }

  /**
   * Update scraper run record
   */
  private async updateScraperRun(
    runId: string,
    status: ScraperStatus,
    stats: ScraperStats,
    errorMessage?: string
  ): Promise<void> {
    try {
      await prisma.scraperRun.update({
        where: { id: runId },
        data: {
          status,
          eventsFound: stats.eventsFound,
          eventsNew: stats.eventsNew,
          eventsUpdated: stats.eventsUpdated,
          errorMessage,
          completedAt: new Date(),
          metadata: {
            eventsDuplicate: stats.eventsDuplicate,
            eventsFlagged: stats.eventsFlagged,
            errors: stats.errors,
            duration: stats.duration,
          },
        },
      });
    } catch (error: any) {
      logger.error(`Failed to update scraper run: ${error.message}`);
    }
  }

  /**
   * Get recent scraper runs for this scraper
   */
  async getRecentRuns(limit: number = 10) {
    return prisma.scraperRun.findMany({
      where: { sourceName: this.name },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get success rate for this scraper
   */
  async getSuccessRate(days: number = 7): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const runs = await prisma.scraperRun.findMany({
      where: {
        sourceName: this.name,
        startedAt: { gte: since },
      },
    });

    if (runs.length === 0) return 0;

    const successful = runs.filter(
      (r) => r.status === ScraperStatus.SUCCESS || r.status === ScraperStatus.PARTIAL
    ).length;

    return (successful / runs.length) * 100;
  }
}
