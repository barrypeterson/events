import { RawEvent, NormalizedEvent } from '../types';
import { logger, cleanText, normalizeString } from './scraper-utils';
import { getOpenAI } from './openai-client';
import { parseEventDate } from './timezone';

/**
 * The LLM is fed a cleanText that has [IMAGE: url] / [LINK: url] markers and
 * is asked to return the URL inside them. Some prompts (or sloppier model
 * passes) come back with the entire marker as the "URL" — leading to stored
 * values like "[IMAGE: https://.../693.jpg]" that 404 when the frontend
 * renders them in an <img src>. Strip the marker brackets defensively so the
 * pipeline can't store a broken URL regardless of what the model emits.
 */
function unwrapMarker(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  let v = value.trim();
  // Match `[IMAGE: ...]` or `[LINK: ...]` (case insensitive)
  const m = v.match(/^\[(?:IMAGE|LINK):\s*(.+?)\s*\]$/i);
  if (m) v = m[1].trim();
  // Some models also strip just the bracket without the prefix (e.g. `[https://...]`)
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner.startsWith('http')) v = inner;
  }
  return v || null;
}

/**
 * Normalize all raw events in a single LLM call.
 * Replaces the N+1 pattern of calling normalizeEvent() per event.
 */
export async function batchNormalizeEvents(
  rawEvents: RawEvent[],
  sourceName: string,
  sourceUrl: string,
  venueName: string,
): Promise<NormalizedEvent[]> {
  if (rawEvents.length === 0) return [];

  const eventsJson = rawEvents.map((e, i) => ({
    index: i,
    title: e.title,
    rawDate: e.rawDate,
    rawTime: e.rawTime,
    rawDescription: e.rawDescription,
    rawPrice: e.rawPrice,
    rawVenue: e.rawVenue || venueName,
  }));

  const prompt = `Normalize these ${rawEvents.length} raw events into structured data.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
TIMEZONE: America/Los_Angeles (Pacific Time)
DEFAULT VENUE: ${venueName}

For each event, return:
- title: cleaned event title
- startDate: Pacific Time local wall-clock as ISO 8601 WITHOUT any timezone offset or "Z", e.g. "2026-06-26T19:30:00" (if only a date is known, default the time to 19:00). Do NOT convert to UTC.
- endDate: same format as startDate, or null
- venueName: venue name
- category: array of categories from [MUSIC, COMEDY, THEATER, SPORTS, FOOD_WINE, ARTS, COMMUNITY, FAMILY, KIDS, OUTDOOR, FITNESS, EDUCATION, BUSINESS, OTHER]
- tags: array of relevant tags
- description: cleaned description or empty string
- priceMin: number or null
- priceMax: number or null
- isFree: boolean
- ageRestriction: string or null

Return a JSON array with one object per event, in the same order as the input. No markdown.

Events to normalize:
${JSON.stringify(eventsJson, null, 2)}`;

  try {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: 'You normalize raw event data into structured format. Return only a JSON array.' },
        { role: 'user', content: prompt },
      ],
    });

    const responseText = response.choices[0]?.message?.content || '[]';
    const match = responseText.match(/\[[\s\S]*\]/);
    if (!match) {
      logger.error(
        `[normalize] source=${sourceName} ABORT reason=no_json_array response_preview="${responseText.slice(0, 200)}"`,
      );
      return [];
    }

    const normalized: any[] = JSON.parse(match[0]);
    const tokens = response.usage?.total_tokens ?? 0;

    const mapped = normalized.map((n: any, i: number) => {
      const raw = rawEvents[i] || rawEvents[0];
      const cleanImage = unwrapMarker(raw.imageUrl);
      const cleanTicket = unwrapMarker(raw.url);
      const cleanDetail = unwrapMarker(raw.detailUrl);
      return {
        title: cleanText(n.title || raw.title),
        normalizedTitle: normalizeString(n.title || raw.title),
        description: cleanText(n.description || ''),
        // Interpret the model's Pacific wall-clock in Pacific, NOT the
        // server's local zone (UTC on Railway) — see lib/timezone.ts.
        startDateTime: parseEventDate(n.startDate),
        endDateTime: n.endDate ? parseEventDate(n.endDate) : undefined,
        timezone: 'America/Los_Angeles',
        venueName: n.venueName || venueName,
        category: Array.isArray(n.category) ? n.category : ['OTHER'],
        tags: Array.isArray(n.tags) ? n.tags : [],
        images: cleanImage ? [cleanImage] : [],
        ticketUrl: cleanTicket || undefined,
        detailUrl: cleanDetail || undefined,
        priceMin: n.priceMin ?? undefined,
        priceMax: n.priceMax ?? undefined,
        isFree: n.isFree ?? false,
        ageRestriction: n.ageRestriction || undefined,
        sourceUrl,
        sourceName,
        rawData: {
          original: raw,
          normalized: n,
        },
      };
    });

    const withValidDates = mapped.filter((e: NormalizedEvent) => {
      if (isNaN(e.startDateTime.getTime())) {
        logger.warn(
          `[normalize] DROP reason=invalid_date source=${sourceName} title="${(e.title || '').slice(0, 60)}" raw_date="${(e.rawData as any)?.original?.rawDate ?? '-'}"`,
        );
        return false;
      }
      return true;
    });

    logger.info(
      `[normalize] source=${sourceName} llm_returned=${normalized.length} mapped=${mapped.length} valid_dates=${withValidDates.length} tokens=${tokens}`,
    );
    return withValidDates;

  } catch (err: any) {
    logger.error(
      `[normalize] source=${sourceName} THREW error="${err?.message || err}"`,
    );
    if (err?.stack) logger.error(`[normalize] stack=${err.stack}`);
    return [];
  }
}
