import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
import { navigateAndExtract } from './page-utils';
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
  const start = Date.now();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, ticketUrl: true, description: true, metadata: true },
  });

  if (!event) {
    logger.warn(`[enrich] event_id=${eventId} SKIP reason=not_found`);
    return false;
  }

  const titleShort = (event.title || '').slice(0, 60);

  if (!event.ticketUrl) {
    logger.debug(`[enrich] event_id=${eventId} SKIP reason=no_url title="${titleShort}"`);
    return false;
  }

  const meta = (event.metadata as any) || {};
  if (meta.enrichedAt) {
    logger.debug(`[enrich] event_id=${eventId} SKIP reason=already_enriched title="${titleShort}"`);
    return false;
  }

  logger.info(`[enrich] event_id=${eventId} START url=${event.ticketUrl} title="${titleShort}"`);

  try {
    const { cleanText, status } = await navigateAndExtract(null, event.ticketUrl);

    if (status >= 400) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=http_status status=${status} ms=${Date.now() - start}`,
      );
      return false;
    }

    if (cleanText.length < 50) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=thin_content clean=${cleanText.length} ms=${Date.now() - start}`,
      );
      return false;
    }

    // Send to LLM for extraction
    const llmStart = Date.now();
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
    const llmTokens = resp.usage?.total_tokens ?? 0;
    let details: any;
    try {
      const match = responseText.match(/\{[\s\S]*\}/);
      details = match ? JSON.parse(match[0]) : null;
    } catch (err: any) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=parse_failed tokens=${llmTokens} llm_ms=${Date.now() - llmStart} error="${err?.message || err}"`,
      );
      return false;
    }

    if (!details || !details.description) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=no_description tokens=${llmTokens} llm_ms=${Date.now() - llmStart}`,
      );
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

    logger.info(
      `[enrich] event_id=${eventId} DONE desc_len=${details.description.length} lineup=${(details.lineup || []).length} door_time=${details.doorTime ? 'yes' : 'no'} age=${details.ageRestriction ? 'yes' : 'no'} tokens=${llmTokens} total_ms=${Date.now() - start}`,
    );
    return true;

  } catch (err: any) {
    logger.error(
      `[enrich] event_id=${eventId} FAILED ms=${Date.now() - start} error="${err?.message || err}"`,
    );
    return false;
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

  const batchStart = Date.now();
  logger.info(`[enrich] BATCH_START candidates=${events.length} limit=${limit}`);

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
      logger.error(`[enrich] event_id=${event.id} THREW error="${err?.message || err}"`);
      failed++;
    }

    // Rate limit: don't hammer venue sites
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  logger.info(
    `[enrich] BATCH_DONE enriched=${enriched} failed=${failed} skipped=${skipped} total=${events.length} duration_s=${((Date.now() - batchStart) / 1000).toFixed(1)}`,
  );
  return { enriched, failed, skipped };
}
