import OpenAI from 'openai';
import { RawEvent, NormalizedEvent, ClaudeEventSchema } from '../types';
import { logger, cleanText, normalizeString } from './scraper-utils';
import { enrichArtist } from './artist-enrichment';

/**
 * Map any category to a valid EventCategory enum value
 */
function mapToValidCategory(category: string): string {
  const validCategories = [
    'MUSIC', 'COMEDY', 'THEATER', 'SPORTS', 'FOOD_WINE',
    'ARTS', 'COMMUNITY', 'FAMILY', 'KIDS', 'OUTDOOR', 'FITNESS',
    'EDUCATION', 'BUSINESS', 'OTHER'
  ];

  const upper = category.toUpperCase();

  // Check if it's already valid
  if (validCategories.includes(upper)) {
    return upper;
  }

  // Map common variations
  const mappings: Record<string, string> = {
    'NIGHTLIFE': 'COMMUNITY',
    'ENTERTAINMENT': 'OTHER',
    'FESTIVAL': 'COMMUNITY',
    'FOOD': 'FOOD_WINE',
    'WINE': 'FOOD_WINE',
    'CONCERT': 'MUSIC',
    'PERFORMANCE': 'ARTS',
    'DANCE': 'ARTS',
    'FILM': 'ARTS',
    'MOVIE': 'ARTS',
    'CHILDREN': 'KIDS',
    'YOUTH': 'KIDS',
  };

  return mappings[upper] || 'OTHER';
}

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

/**
 * Normalize raw scraped event data using Claude AI
 */
export async function normalizeEvent(
  raw: RawEvent,
  sourceName: string,
  sourceUrl: string
): Promise<NormalizedEvent> {
  try {
    logger.debug(`Normalizing event: ${raw.title}`);

    const prompt = buildNormalizationPrompt(raw);

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = ClaudeEventSchema.parse(parsed);

    // Convert to NormalizedEvent
    // Parse dates - Claude returns ISO strings without timezone
    // These represent Pacific Time, so we parse them as-is
    // PostgreSQL will store them correctly with the timezone field
    const startDateTime = new Date(validated.startDate);
    const endDateTime = validated.endDate ? new Date(validated.endDate) : undefined;

    const normalized: NormalizedEvent = {
      title: cleanText(validated.title),
      normalizedTitle: normalizeString(validated.title),
      description: validated.description ? cleanText(validated.description) : undefined,
      startDateTime,
      endDateTime,
      timezone: 'America/Los_Angeles',
      venueName: cleanText(validated.venueName),
      category: validated.category.map((c: string) => mapToValidCategory(c.toUpperCase())),
      tags: validated.tags,
      images: raw.imageUrl ? [raw.imageUrl] : [],
      ticketUrl: raw.url,
      priceMin: validated.priceMin,
      priceMax: validated.priceMax,
      isFree: validated.isFree,
      ageRestriction: validated.ageRestriction,
      sourceUrl,
      sourceName,
      rawData: {
        original: raw,
        claudeResponse: validated,
      },
    };

    // Enrich music events with artist information from Spotify
    // Only if event is categorized as MUSIC and Spotify is configured
    if (normalized.category.includes('MUSIC') && process.env.SPOTIFY_CLIENT_ID) {
      try {
        const artistInfo = await enrichArtist(normalized.title, normalized.description, normalized.tags);

        if (artistInfo) {
          // Add artist info to rawData for storage in event metadata
          normalized.rawData.artistInfo = artistInfo;
          logger.info(`Enriched event with artist data: ${artistInfo.name} (Spotify popularity: ${artistInfo.popularity})`);

          // Add artist image if event doesn't have an image
          if (!normalized.images.length && artistInfo.imageUrl) {
            normalized.images = [artistInfo.imageUrl];
          }

          // Add genres as tags if not already present
          if (artistInfo.genres) {
            const newGenreTags = artistInfo.genres
              .map(g => g.toLowerCase())
              .filter(g => !normalized.tags.includes(g));
            normalized.tags = [...normalized.tags, ...newGenreTags.slice(0, 3)]; // Add up to 3 genre tags
          }
        }
      } catch (error: any) {
        // Don't fail normalization if enrichment fails
        logger.warn(`Artist enrichment failed for "${normalized.title}": ${error.message}`);
      }
    }

    logger.info(`Successfully normalized event: ${normalized.title}`);
    return normalized;
  } catch (error: any) {
    logger.error(`Failed to normalize event: ${error.message}`, {
      raw,
      error: error.stack,
    });
    throw new Error(`Event normalization failed: ${error.message}`);
  }
}

/**
 * Build Claude prompt for event normalization
 */
function buildNormalizationPrompt(raw: RawEvent): string {
  const parts = [
    'Extract structured event information from the following raw data.',
    'Return ONLY a JSON object (no markdown, no explanation) with these exact fields:',
    '',
    'Required fields:',
    '- title: string (cleaned event title)',
    '- startDate: string (ISO 8601 format with Pacific timezone, e.g., "2025-10-19T19:00:00-07:00" for PDT or "2025-10-19T19:00:00-08:00" for PST)',
    '- venueName: string (venue or location name)',
    '- category: string[] (1-3 categories from: music, theater, sports, comedy, arts, food, community, nightlife, family, kids, education)',
    '- tags: string[] (2-5 relevant tags, lowercase)',
    '- isFree: boolean (true if free admission)',
    '',
    'Optional fields:',
    '- description: string (brief event description)',
    '- endDate: string (ISO 8601 format with Pacific timezone if available, same format as startDate)',
    '- priceMin: number (minimum ticket price in dollars)',
    '- priceMax: number (maximum ticket price in dollars)',
    '- ageRestriction: string (e.g., "21+", "18+", "All Ages")',
    '',
    'Rules:',
    '- If date/time is relative (e.g., "Tonight", "Tomorrow"), use context to infer absolute date',
    '- Current date/time context: ' + new Date().toISOString(),
    '- Default to 7:00 PM (19:00) if time is not specified',
    '- ALL dates must be in Pacific Time (America/Los_Angeles timezone)',
    '- Use ISO 8601 format WITHOUT timezone suffix (e.g., "2025-10-25T20:00:00") - will be interpreted as Pacific Time',
    '- If both start and end times are provided, include endDate with the same date but different time',
    '- Infer categories from title and description',
    '- Generate relevant tags (genres, themes, keywords)',
    '- If price is "Free" or not mentioned, set isFree: true',
    '',
    '---',
    '',
    'RAW EVENT DATA:',
  ];

  if (raw.title) {
    parts.push(`Title: ${raw.title}`);
  }

  if (raw.rawDescription) {
    parts.push(`Description: ${raw.rawDescription}`);
  }

  if (raw.rawDate) {
    parts.push(`Date: ${raw.rawDate}`);
  }

  if (raw.rawTime) {
    parts.push(`Start Time: ${raw.rawTime}`);
  }

  if (raw.rawEndTime) {
    parts.push(`End Time: ${raw.rawEndTime}`);
  }

  if (raw.rawVenue) {
    parts.push(`Venue: ${raw.rawVenue}`);
  }

  if (raw.rawPrice) {
    parts.push(`Price: ${raw.rawPrice}`);
  }

  if (raw.rawHtml) {
    parts.push(`HTML Snippet: ${raw.rawHtml.substring(0, 500)}`);
  }

  if (raw.rawText) {
    parts.push(`Text Content: ${raw.rawText.substring(0, 500)}`);
  }

  // Add sport/event type hint if available in metadata
  if (raw.metadata?.sport) {
    parts.push(`Sport/Type: ${raw.metadata.sport}`);
    parts.push('IMPORTANT: This is a SPORTS event. Include "sports" in the category array.');
  }

  if (raw.metadata?.eventType === 'athletics') {
    parts.push('IMPORTANT: This is an athletics/sports event. Primary category should be "sports".');
  }

  // Add kid-friendly venue hint
  const kidFriendlyVenues = [
    'children\'s museum', 'library', 'botanical garden', 'parks', 'recreation',
    'first 5', 'family'
  ];
  const venueText = (raw.rawVenue || '').toLowerCase();
  const isKidFriendlyVenue = kidFriendlyVenues.some(keyword => venueText.includes(keyword));

  if (isKidFriendlyVenue) {
    parts.push('');
    parts.push('IMPORTANT: This event is at a kid-friendly/family venue. Consider these guidelines:');
    parts.push('- If explicitly for children/kids (ages 0-12), include "kids" in categories');
    parts.push('- If family-friendly (all ages welcome), include "family" in categories');
    parts.push('- Add relevant kid-friendly tags: "kid-friendly", "children", "educational", "storytime", "crafts", "workshop", etc.');
    parts.push('- If age range is mentioned (e.g., "ages 5-10"), include it in the description');
  }

  parts.push('');
  parts.push('Return ONLY the JSON object:');

  return parts.join('\n');
}

/**
 * Batch normalize multiple events
 */
export async function normalizeEvents(
  rawEvents: RawEvent[],
  sourceName: string,
  sourceUrl: string
): Promise<NormalizedEvent[]> {
  const normalized: NormalizedEvent[] = [];
  const errors: Array<{ event: RawEvent; error: string }> = [];

  for (const raw of rawEvents) {
    try {
      const result = await normalizeEvent(raw, sourceName, sourceUrl);
      normalized.push(result);

      // Rate limiting: wait 1 second between Claude API calls
      if (rawEvents.indexOf(raw) < rawEvents.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      logger.error(`Failed to normalize event: ${raw.title}`, error);
      errors.push({ event: raw, error: error.message });
    }
  }

  if (errors.length > 0) {
    logger.warn(`${errors.length}/${rawEvents.length} events failed normalization`);
  }

  return normalized;
}
