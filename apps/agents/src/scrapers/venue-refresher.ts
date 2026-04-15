import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
import { browserPool } from '../lib/browser-pool';
import { navigateAndExtract } from '../lib/page-utils';
import { logger } from '../lib/scraper-utils';
import { batchNormalizeEvents } from '../lib/batch-normalizer';
import { matchOrCreateVenue } from '../lib/venue-matcher';
import { deduplicateEvent } from '../lib/deduplicator';
import { generateEmbedding } from '../lib/embeddings';
import { storeImages } from '../lib/image-store';
import type { PageAnalysis, RawEvent, ScraperStats } from '../types';

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Refresh events for a venue using its stored page analysis.
 * Cheap recurring operation: Playwright + 2 LLM calls (extract + normalize).
 */
export async function refreshVenue(configId: string): Promise<ScraperStats> {
  const config = await prisma.venueScraperConfig.findUniqueOrThrow({
    where: { id: configId },
    include: { venue: true },
  });

  const analysis = config.pageAnalysis as PageAnalysis | null;
  if (!analysis?.extractionPrompt) {
    throw new Error(`${config.sourceName}: no page analysis found. Run analyze first.`);
  }

  const stats: ScraperStats = {
    eventsFound: 0,
    eventsNew: 0,
    eventsUpdated: 0,
    eventsDuplicate: 0,
    eventsFlagged: 0,
    errors: 0,
    duration: 0,
  };
  const startTime = Date.now();

  // Track scraper run
  const scraperRun = await prisma.scraperRun.create({
    data: {
      sourceName: config.sourceName,
      sourceUrl: config.sourceUrl,
      status: 'RUNNING',
    },
  });

  const context = await browserPool.createContext();
  const page = await context.newPage();

  try {
    // 1. Navigate and get clean text
    const { cleanText, status } = await navigateAndExtract(page, config.sourceUrl, analysis);

    if (status >= 400) {
      throw new Error(`Page returned ${status}`);
    }

    logger.info(`[refresh] ${config.sourceName}: ${cleanText.length} chars, status ${status}`);

    // 2. Extract events using stored prompt + gpt-4o-mini
    // The clean text now contains [IMAGE: url] markers inline with content
    const client = getOpenAI();
    const extractResponse = await client.chat.completions.create({
      model: config.refreshModel || 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: analysis.extractionPrompt },
        { role: 'user', content: `Extract all upcoming events from this page content. Image URLs appear as [IMAGE: url] markers near their associated event.\n\n${cleanText}` },
      ],
    });

    const extractText = extractResponse.choices[0]?.message?.content || '[]';
    let rawEvents: RawEvent[];
    try {
      const match = extractText.match(/\[[\s\S]*\]/);
      const parsed = match ? JSON.parse(match[0]) : [];
      rawEvents = parsed.map((e: any) => ({
        title: e.title,
        rawDate: e.rawDate || e.date,
        rawTime: e.rawTime || e.time,
        rawDescription: e.rawDescription || e.description || '',
        rawPrice: e.rawPrice || e.price || '',
        imageUrl: e.imageUrl || null,
        url: e.url || null,
        rawVenue: config.venue.name,
        metadata: {
          scrapedAt: new Date().toISOString(),
          source: config.sourceName,
          extractionMethod: 'playwright-refresh',
        },
      }));
    } catch {
      logger.error(`[refresh] ${config.sourceName}: failed to parse extraction response`);
      rawEvents = [];
    }

    stats.eventsFound = rawEvents.length;
    const withImages = rawEvents.filter(e => e.imageUrl).length;
    logger.info(`[refresh] ${config.sourceName}: ${withImages}/${rawEvents.length} events have images`);
    logger.info(`[refresh] ${config.sourceName}: extracted ${rawEvents.length} raw events`);

    if (rawEvents.length === 0) {
      await updateRunStatus(scraperRun.id, 'PARTIAL', stats);
      await updateConfigStatus(configId, 'PARTIAL');
      return finalizeStats(stats, startTime);
    }

    // 3. Batch normalize (1 LLM call for all events)
    const normalizedEvents = await batchNormalizeEvents(
      rawEvents,
      config.sourceName,
      config.sourceUrl,
      config.venue.name,
    );

    logger.info(`[refresh] ${config.sourceName}: batch normalized ${normalizedEvents.length} events`);

    if (normalizedEvents.length === 0) {
      logger.warn(`[refresh] ${config.sourceName}: batch normalization returned 0 events from ${rawEvents.length} raw`);
      await updateRunStatus(scraperRun.id, 'PARTIAL', stats);
      await updateConfigStatus(configId, 'PARTIAL');
      return finalizeStats(stats, startTime);
    }

    // 3.5 Store images in S3 (falls through if not configured)
    for (const event of normalizedEvents) {
      if (event.images && event.images.length > 0) {
        event.images = await storeImages(event.images);
      }
    }

    // 4. Match venue + dedup + save (existing pipeline)
    for (const event of normalizedEvents) {
      try {
        const venueMatch = await matchOrCreateVenue(
          event.venueName || config.venue.name,
          'San Luis Obispo',
        );
        event.venueId = venueMatch.venueId;

        const embeddingText = [event.title, event.description || '', event.venueName, ...(event.category || []), ...(event.tags || [])].filter(Boolean).join(' ');
        const embedding = await generateEmbedding(embeddingText);
        const result = await deduplicateEvent(event, embedding);
        switch (result.action) {
          case 'create': stats.eventsNew++; break;
          case 'update': stats.eventsUpdated++; break;
          case 'merge': stats.eventsDuplicate++; break;
          case 'flag': stats.eventsFlagged++; break;
        }
      } catch (err: any) {
        logger.error(`[refresh] ${config.sourceName}: failed to save event "${event.title}": ${err.message}`);
        stats.errors++;
      }
    }

    const runStatus = stats.errors > 0 ? 'PARTIAL' : 'SUCCESS';
    await updateRunStatus(scraperRun.id, runStatus, stats);
    await updateConfigStatus(configId, runStatus);

    logger.info(`[refresh] ${config.sourceName}: done. ${stats.eventsNew} new, ${stats.eventsUpdated} updated, ${stats.errors} errors`);

  } catch (err: any) {
    logger.error(`[refresh] ${config.sourceName}: failed: ${err.message}`);
    stats.errors++;
    await updateRunStatus(scraperRun.id, 'FAILED', stats, err.message);
    await updateConfigStatus(configId, 'FAILED');
  } finally {
    await page.close();
    await context.close();
  }

  return finalizeStats(stats, startTime);
}

function finalizeStats(stats: ScraperStats, startTime: number): ScraperStats {
  stats.duration = (Date.now() - startTime) / 1000;
  return stats;
}

async function updateRunStatus(
  runId: string,
  status: string,
  stats: ScraperStats,
  errorMessage?: string,
) {
  await prisma.scraperRun.update({
    where: { id: runId },
    data: {
      status,
      eventsFound: stats.eventsFound,
      eventsNew: stats.eventsNew,
      eventsUpdated: stats.eventsUpdated,
      completedAt: new Date(),
      errorMessage,
    },
  });
}

async function updateConfigStatus(configId: string, status: string) {
  await prisma.venueScraperConfig.update({
    where: { id: configId },
    data: {
      lastRefreshedAt: new Date(),
      lastRefreshStatus: status,
    },
  });
}
