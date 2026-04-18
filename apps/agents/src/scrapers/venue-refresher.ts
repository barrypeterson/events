import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
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

  logger.info(
    `[refresh] ${config.sourceName} START url=${config.sourceUrl} requiresProxy=${config.requiresProxy} model=${config.refreshModel}`,
  );

  // Track scraper run
  const scraperRun = await prisma.scraperRun.create({
    data: {
      sourceName: config.sourceName,
      sourceUrl: config.sourceUrl,
      status: 'RUNNING',
    },
  });

  try {
    // 1. Navigate and get clean text
    const { cleanText, status } = await navigateAndExtract(null, config.sourceUrl, analysis, {
      useProxy: config.requiresProxy,
      onProxyEscalation: async () => {
        logger.warn(`[refresh] ${config.sourceName}: marking requiresProxy=true (direct blocked, proxy succeeded)`);
        await prisma.venueScraperConfig.update({
          where: { id: configId },
          data: { requiresProxy: true, proxyEscalatedAt: new Date() },
        });
      },
    });

    if (status >= 400) {
      throw new Error(`Page returned ${status}`);
    }

    logger.info(
      `[refresh] ${config.sourceName} navigated clean=${cleanText.length} status=${status}`,
    );

    // 2. Extract events using stored prompt + gpt-4o-mini
    // The clean text now contains [IMAGE: url] markers inline with content
    const extractStart = Date.now();
    const client = getOpenAI();
    const extractResponse = await client.chat.completions.create({
      model: config.refreshModel || 'gpt-4o-mini',
      // 8192 matches the analyzer validation cap — a full venue's event array
      // can easily exceed 4k tokens, and truncation yields malformed JSON
      // which our parser drops to raw=0.
      max_tokens: 8192,
      messages: [
        { role: 'system', content: analysis.extractionPrompt },
        { role: 'user', content: `Extract all upcoming events from this page content. Image URLs appear as [IMAGE: url] markers near their associated event.\n\n${cleanText}` },
      ],
    });

    const extractText = extractResponse.choices[0]?.message?.content || '[]';
    const extractTokens = extractResponse.usage?.total_tokens ?? 0;
    const extractCompletionTokens = extractResponse.usage?.completion_tokens ?? 0;
    const extractFinish = extractResponse.choices[0]?.finish_reason || 'unknown';
    let rawEvents: RawEvent[];
    let parseFailed = false;
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
    } catch (err: any) {
      parseFailed = true;
      logger.error(
        `[refresh] ${config.sourceName} extract parse_failed error="${err?.message || err}" response_preview="${extractText.slice(0, 200)}"`,
      );
      rawEvents = [];
    }

    stats.eventsFound = rawEvents.length;
    const withImages = rawEvents.filter(e => e.imageUrl).length;
    const withUrls = rawEvents.filter(e => e.url).length;
    const withDates = rawEvents.filter(e => e.rawDate).length;
    logger.info(
      `[refresh] ${config.sourceName} extracted raw=${rawEvents.length} with_images=${withImages} with_urls=${withUrls} with_dates=${withDates} total_tokens=${extractTokens} completion_tokens=${extractCompletionTokens} finish=${extractFinish} ms=${Date.now() - extractStart} parse_failed=${parseFailed}`,
    );

    if (rawEvents.length === 0) {
      // Log the LLM response and the text we fed in so we can tell whether
      // the model refused, returned something non-array, or saw an empty page.
      const preview = extractText.slice(0, 500).replace(/\s+/g, ' ');
      const textPreview = cleanText.slice(0, 300).replace(/\s+/g, ' ');
      logger.warn(
        `[refresh] ${config.sourceName} ABORT no_raw_events (parse_failed=${parseFailed}) clean_chars=${cleanText.length} llm_response_preview="${preview}" clean_text_preview="${textPreview}"`,
      );
      if (cleanText.length > 1000 && !parseFailed) {
        logger.warn(
          `[refresh] ${config.sourceName} suggestion: the stored extraction prompt returned [] on ${cleanText.length} chars of content — re-run analyze to regenerate the prompt.`,
        );
      }
      await updateRunStatus(scraperRun.id, 'PARTIAL', stats);
      await updateConfigStatus(configId, 'PARTIAL');
      return finalizeStats(stats, startTime);
    }

    // 3. Batch normalize (1 LLM call for all events)
    const normStart = Date.now();
    const normalizedEvents = await batchNormalizeEvents(
      rawEvents,
      config.sourceName,
      config.sourceUrl,
      config.venue.name,
    );
    const dropped = rawEvents.length - normalizedEvents.length;
    logger.info(
      `[refresh] ${config.sourceName} normalized in=${rawEvents.length} out=${normalizedEvents.length} dropped=${dropped} ms=${Date.now() - normStart}`,
    );

    if (normalizedEvents.length === 0) {
      logger.warn(
        `[refresh] ${config.sourceName} ABORT normalize_empty raw=${rawEvents.length}`,
      );
      await updateRunStatus(scraperRun.id, 'PARTIAL', stats);
      await updateConfigStatus(configId, 'PARTIAL');
      return finalizeStats(stats, startTime);
    }

    // 3.5 Store images in S3 (falls through if not configured).
    // Image-storage failures must NEVER abort the refresh — we've got 25 valid
    // events already normalized; losing all of them because one image URL is
    // malformed is the wrong tradeoff. Per-event try/catch with origin-URL
    // fallback keeps the pipeline moving.
    let imagesStored = 0;
    let imageFailures = 0;
    for (const event of normalizedEvents) {
      if (event.images && event.images.length > 0) {
        try {
          event.images = await storeImages(event.images);
          imagesStored += event.images.length;
        } catch (err: any) {
          imageFailures++;
          logger.warn(
            `[refresh] ${config.sourceName} storeImages threw for event "${(event.title || '').slice(0, 60)}" — keeping original URLs. error="${err?.message || err}"`,
          );
        }
      }
    }
    if (imagesStored > 0 || imageFailures > 0) {
      logger.info(
        `[refresh] ${config.sourceName} stored_images count=${imagesStored} failures=${imageFailures}`,
      );
    }

    // 4. Match venue + dedup + save (existing pipeline)
    for (const event of normalizedEvents) {
      const eventStart = Date.now();
      const titleShort = (event.title || '').slice(0, 60);
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
        logger.info(
          `[refresh] ${config.sourceName} event action=${result.action} path=${result.matchPath ?? 'unknown'} id=${result.eventId} venue_id=${venueMatch.venueId} score=${result.similarityScore?.toFixed(3) ?? '-'} ms=${Date.now() - eventStart} title="${titleShort}"`,
        );
      } catch (err: any) {
        logger.error(
          `[refresh] ${config.sourceName} event FAILED title="${titleShort}" ms=${Date.now() - eventStart} error="${err?.message || err}"`,
        );
        stats.errors++;
      }
    }

    const runStatus = stats.errors > 0 ? 'PARTIAL' : 'SUCCESS';
    await updateRunStatus(scraperRun.id, runStatus, stats);
    await updateConfigStatus(configId, runStatus);

    logger.info(
      `[refresh] ${config.sourceName} DONE status=${runStatus} raw=${stats.eventsFound} new=${stats.eventsNew} updated=${stats.eventsUpdated} merged=${stats.eventsDuplicate} flagged=${stats.eventsFlagged} errors=${stats.errors} duration_s=${((Date.now() - startTime) / 1000).toFixed(1)}`,
    );

  } catch (err: any) {
    logger.error(`[refresh] ${config.sourceName}: failed: ${err.message}`);
    stats.errors++;
    await updateRunStatus(scraperRun.id, 'FAILED', stats, err.message);
    await updateConfigStatus(configId, 'FAILED');
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
