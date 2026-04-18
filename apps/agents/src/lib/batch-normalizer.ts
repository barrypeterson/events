import { RawEvent, NormalizedEvent } from '../types';
import { logger, cleanText, normalizeString } from './scraper-utils';
import { getOpenAI } from './openai-client';

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
- startDate: ISO 8601 datetime in Pacific Time (if only a date, default to 19:00)
- endDate: ISO 8601 or null
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
      return {
        title: cleanText(n.title || raw.title),
        normalizedTitle: normalizeString(n.title || raw.title),
        description: cleanText(n.description || ''),
        startDateTime: new Date(n.startDate),
        endDateTime: n.endDate ? new Date(n.endDate) : undefined,
        timezone: 'America/Los_Angeles',
        venueName: n.venueName || venueName,
        category: Array.isArray(n.category) ? n.category : ['OTHER'],
        tags: Array.isArray(n.tags) ? n.tags : [],
        images: raw.imageUrl ? [raw.imageUrl] : [],
        ticketUrl: raw.url || undefined,
        detailUrl: raw.detailUrl || undefined,
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
