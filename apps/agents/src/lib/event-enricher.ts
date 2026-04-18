import { prisma } from '@slo-events/database';
import { navigateAndExtract } from './page-utils';
import { logger } from './scraper-utils';
import { getOpenAI } from './openai-client';

/**
 * Ticket-provider domains that aggressively block scrapers (Cloudflare/WAF).
 * Enrichment against these will almost always return 401/403 and burn time +
 * proxy bandwidth for no result. If an event's only URL is on one of these,
 * skip enrichment entirely.
 */
const TICKET_PROVIDER_DOMAINS = new Set([
  'ticketmaster.com',
  'www.ticketmaster.com',
  'axs.com',
  'www.axs.com',
  'eventbrite.com',
  'www.eventbrite.com',
  'prekindle.com',
  'www.prekindle.com',
  'seetickets.us',
  'www.seetickets.us',
  'etix.com',
  'www.etix.com',
  'dice.fm',
  'www.dice.fm',
  'livenation.com',
  'www.livenation.com',
  'stubhub.com',
  'www.stubhub.com',
  'vividseats.com',
  'www.vividseats.com',
]);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isTicketProvider(url: string): boolean {
  const host = hostnameOf(url);
  return host !== null && TICKET_PROVIDER_DOMAINS.has(host);
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
export type EnrichmentOutcome =
  | { success: true }
  | {
      success: false;
      reason:
        | 'not_found'
        | 'already_enriched'
        | 'no_url'
        | 'third_party_ticket_only'
        | 'http_status'
        | 'thin_content'
        | 'parse_failed'
        | 'no_description'
        | 'exception';
      detail?: string;
    };

export async function enrichEventDetails(
  eventId: string,
  opts?: { force?: boolean },
): Promise<EnrichmentOutcome> {
  const start = Date.now();
  const force = opts?.force === true;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      ticketUrl: true,
      detailUrl: true,
      description: true,
      metadata: true,
    },
  });

  if (!event) {
    logger.warn(`[enrich] event_id=${eventId} SKIP reason=not_found`);
    return { success: false, reason: 'not_found' };
  }

  const titleShort = (event.title || '').slice(0, 60);

  const meta = (event.metadata as any) || {};
  if (meta.enrichedAt && !force) {
    logger.debug(`[enrich] event_id=${eventId} SKIP reason=already_enriched title="${titleShort}"`);
    return { success: false, reason: 'already_enriched' };
  }
  if (meta.enrichedAt && force) {
    logger.info(`[enrich] event_id=${eventId} FORCE re-enriching previously-enriched event`);
  }

  // Prefer detailUrl (venue's own page). Fall back to ticketUrl only if
  // it's NOT a known ticket-provider domain — those are bot-walled and burn
  // proxy bandwidth for guaranteed 401/403s.
  let enrichUrl: string | null = null;
  let enrichSource = '';
  if (event.detailUrl) {
    enrichUrl = event.detailUrl;
    enrichSource = 'detail';
  } else if (event.ticketUrl && !isTicketProvider(event.ticketUrl)) {
    enrichUrl = event.ticketUrl;
    enrichSource = 'ticket';
  }

  if (!enrichUrl) {
    if (event.ticketUrl && isTicketProvider(event.ticketUrl)) {
      const host = hostnameOf(event.ticketUrl) || undefined;
      logger.info(
        `[enrich] event_id=${eventId} SKIP reason=third_party_ticket_only host=${host} title="${titleShort}"`,
      );
      return { success: false, reason: 'third_party_ticket_only', detail: host };
    }
    logger.debug(`[enrich] event_id=${eventId} SKIP reason=no_url title="${titleShort}"`);
    return { success: false, reason: 'no_url' };
  }

  logger.info(
    `[enrich] event_id=${eventId} START url=${enrichUrl} src=${enrichSource} title="${titleShort}"`,
  );

  try {
    const { cleanText, status } = await navigateAndExtract(null, enrichUrl);

    if (status >= 400) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=http_status status=${status} ms=${Date.now() - start}`,
      );
      return { success: false, reason: 'http_status', detail: `HTTP ${status}` };
    }

    if (cleanText.length < 50) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=thin_content clean=${cleanText.length} ms=${Date.now() - start}`,
      );
      return { success: false, reason: 'thin_content', detail: `${cleanText.length} chars` };
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
      return { success: false, reason: 'parse_failed', detail: err?.message || String(err) };
    }

    if (!details || !details.description) {
      logger.warn(
        `[enrich] event_id=${eventId} ABORT reason=no_description tokens=${llmTokens} llm_ms=${Date.now() - llmStart}`,
      );
      return { success: false, reason: 'no_description' };
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
    return { success: true };

  } catch (err: any) {
    logger.error(
      `[enrich] event_id=${eventId} FAILED ms=${Date.now() - start} error="${err?.message || err}"`,
    );
    return { success: false, reason: 'exception', detail: err?.message || String(err) };
  }
}

/**
 * Enrich all events that have a URL but no description.
 */
export async function enrichUnenrichedEvents(limit: number = 50): Promise<{ enriched: number; failed: number; skipped: number }> {
  // Need SOME scrapable URL — prefer detail_url, accept ticket_url too (the
  // per-event enrichEventDetails() will filter out ticket-provider domains
  // to avoid wasting requests on Ticketmaster/AXS/etc.).
  const events = await prisma.$queryRaw<Array<{ id: string; title: string }>>`
    SELECT id, title FROM events
    WHERE (
      (detail_url IS NOT NULL AND detail_url != '')
      OR (ticket_url IS NOT NULL AND ticket_url != '')
    )
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
      if (result.success) {
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
