import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
import { browserPool } from './browser-pool';
import { getCleanPageText } from './page-utils';
import { logger } from './scraper-utils';

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const ENRICHMENT_PROMPT = `You are extracting detailed information about an event from its detail page.

Given the page content, extract:
- description: A clean 2-3 paragraph description of the event. Include what the event is about, who is performing/presenting, and what attendees can expect. Do NOT include venue address, date/time, or ticket prices in the description (those are stored separately).
- doorTime: When doors open (e.g., "6:30 PM"), null if not mentioned
- ageRestriction: Age policy (e.g., "21+", "All Ages", "18+"), null if not mentioned
- lineup: Array of performer/act names if this is a music/performance event, empty array otherwise
- ticketUrl: Direct link to purchase tickets if found on this page, null if not found

Return ONLY a JSON object with these fields. No markdown, no explanations.
If the page doesn't contain meaningful event details, return: {"description": null, "doorTime": null, "ageRestriction": null, "lineup": [], "ticketUrl": null}`;

/**
 * Enrich a single event by visiting its detail page.
 * Extracts description, door time, age restriction, lineup, and ticket URL.
 */
export async function enrichEventDetails(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, ticketUrl: true, description: true, metadata: true },
  });

  if (!event) {
    logger.warn(`[enrich] Event ${eventId} not found`);
    return false;
  }

  if (!event.ticketUrl) {
    logger.debug(`[enrich] ${event.title}: no URL to visit`);
    return false;
  }

  const meta = (event.metadata as any) || {};
  if (meta.enrichedAt) {
    logger.debug(`[enrich] ${event.title}: already enriched`);
    return false;
  }

  logger.info(`[enrich] Visiting detail page for: ${event.title}`);

  const context = await browserPool.createContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(event.ticketUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    if (!response || response.status() >= 400) {
      logger.warn(`[enrich] ${event.title}: page returned ${response?.status()}`);
      return false;
    }

    const cleanText = await getCleanPageText(page);

    if (cleanText.length < 50) {
      logger.warn(`[enrich] ${event.title}: page has no meaningful content`);
      return false;
    }

    // Send to LLM for extraction
    const client = getOpenAI();
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: ENRICHMENT_PROMPT },
        { role: 'user', content: `Event: "${event.title}"\n\nPage content:\n${cleanText.substring(0, 8000)}` },
      ],
    });

    const responseText = resp.choices[0]?.message?.content || '';
    let details: any;
    try {
      const match = responseText.match(/\{[\s\S]*\}/);
      details = match ? JSON.parse(match[0]) : null;
    } catch {
      logger.warn(`[enrich] ${event.title}: failed to parse LLM response`);
      return false;
    }

    if (!details || !details.description) {
      logger.warn(`[enrich] ${event.title}: LLM returned no description`);
      return false;
    }

    // Update event with enriched data
    await prisma.event.update({
      where: { id: eventId },
      data: {
        description: details.description,
        ageRestriction: details.ageRestriction || event.description,
        ticketUrl: details.ticketUrl || event.ticketUrl,
        metadata: {
          ...meta,
          enrichedAt: new Date().toISOString(),
          enrichedDetails: {
            doorTime: details.doorTime,
            lineup: details.lineup || [],
          },
        },
      },
    });

    logger.info(`[enrich] ${event.title}: enriched successfully`);
    return true;

  } catch (err: any) {
    logger.error(`[enrich] ${event.title}: failed: ${err.message}`);
    return false;
  } finally {
    await page.close();
    await context.close();
  }
}

/**
 * Enrich all events that have a URL but no description.
 */
export async function enrichUnenrichedEvents(limit: number = 50): Promise<{ enriched: number; failed: number; skipped: number }> {
  const events = await prisma.$queryRaw<Array<{ id: string; title: string }>>`
    SELECT id, title FROM events
    WHERE ticket_url IS NOT NULL
      AND ticket_url != ''
      AND (metadata->>'enrichedAt' IS NULL)
      AND status = 'ACTIVE'
      AND (
        description IS NULL
        OR description = ''
        OR description = title
        OR LENGTH(description) < 50
      )
    ORDER BY start_datetime ASC
    LIMIT ${limit}
  `;

  logger.info(`[enrich] Found ${events.length} events to enrich`);

  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      const result = await enrichEventDetails(event.id);
      if (result) {
        enriched++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      logger.error(`[enrich] ${event.title}: ${err.message}`);
      failed++;
    }

    // Rate limit: don't hammer venue sites
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  logger.info(`[enrich] Done: ${enriched} enriched, ${failed} failed, ${skipped} skipped`);
  return { enriched, failed, skipped };
}
