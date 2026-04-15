import OpenAI from 'openai';
import { RawEvent } from '../types';
import { logger, retryWithBackoff } from './scraper-utils';

// Shared OpenAI client singleton
let openaiInstance: OpenAI | null = null;

export function getOpenAI(): OpenAI {
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

export const LLM_MODEL = 'gpt-4o-mini';
export const LLM_MAX_TOKENS = 8192;

/**
 * Call LLM API with retry logic and specific error handling.
 */
export async function callClaude(
  prompt: string,
  scraperName: string,
): Promise<OpenAI.Chat.ChatCompletion> {
  return retryWithBackoff(async () => {
    try {
      return await getOpenAI().chat.completions.create({
        model: LLM_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error: unknown) {
      if (error instanceof OpenAI.AuthenticationError) {
        logger.error(`[${scraperName}] OpenAI auth error — check API key`);
        throw error;
      }
      if (error instanceof OpenAI.RateLimitError) {
        logger.warn(`[${scraperName}] OpenAI rate limited — will retry`);
        throw error;
      }
      if (error instanceof OpenAI.APIConnectionError) {
        logger.warn(`[${scraperName}] OpenAI connection error — will retry`);
        throw error;
      }
      throw error;
    }
  }, 3, 2000);
}

/**
 * Parse LLM response text into an array of extracted events.
 * Handles markdown code fences, malformed JSON, and empty responses.
 */
export function parseClaudeResponse(responseText: string, scraperName: string): any[] {
  if (!responseText || !responseText.trim()) {
    logger.warn(`[${scraperName}] Empty response from LLM`);
    return [];
  }

  // Clean up markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  }

  // Extract JSON array from response
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.warn(`[${scraperName}] No JSON array found in LLM response. Preview: ${responseText.substring(0, 200)}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseError: any) {
    logger.error(`[${scraperName}] JSON parse error: ${parseError.message}`);
    logger.debug(`[${scraperName}] Failed JSON: ${jsonMatch[0].substring(0, 500)}`);
    return [];
  }
}

/**
 * Validate extracted events and convert to RawEvent format.
 */
export function validateAndMapEvents(
  extractedEvents: any[],
  options: {
    scraperName: string;
    venueName: string;
    extractionMethod: string;
    sourceDomain?: string;
  },
): RawEvent[] {
  const { scraperName, venueName, extractionMethod, sourceDomain } = options;
  const now = new Date();

  const validated = extractedEvents.filter((event: any) => {
    if (!event.title || !event.rawDate) {
      logger.warn(`[${scraperName}] Skipping invalid event: missing title or date`);
      return false;
    }

    if (event.url && sourceDomain) {
      try {
        const eventDomain = new URL(event.url).hostname;
        if (
          !eventDomain.includes(sourceDomain.replace('www.', '')) &&
          !sourceDomain.includes(eventDomain.replace('www.', ''))
        ) {
          logger.warn(
            `[${scraperName}] Suspicious URL domain (${eventDomain}) vs source (${sourceDomain})`
          );
        }
      } catch {
        // Invalid URL
      }
    }

    return true;
  });

  if (validated.length < extractedEvents.length) {
    logger.warn(
      `[${scraperName}] Filtered out ${extractedEvents.length - validated.length} invalid events`
    );
  }

  return validated
    .map((event: any) => ({
      title: event.title,
      rawDate: event.rawDate,
      rawTime: event.rawTime,
      rawDescription: event.rawDescription || event.description,
      rawVenue: venueName,
      rawPrice: event.rawPrice || event.price,
      imageUrl: event.imageUrl,
      url: event.url,
      metadata: {
        scrapedAt: new Date().toISOString(),
        source: scraperName,
        extractionMethod,
        ...(event.elementRef ? { elementRef: event.elementRef } : {}),
      },
    }))
    .filter((event: RawEvent) => {
      try {
        const dateStr = `${event.rawDate} ${event.rawTime || ''}`.trim();
        const eventDate = new Date(dateStr);
        if (!isNaN(eventDate.getTime()) && eventDate < now) {
          logger.debug(`[${scraperName}] Filtering past event: ${event.title} (${dateStr})`);
          return false;
        }
      } catch {
        // Keep if unparseable
      }
      return true;
    });
}

/**
 * Extract text content from an OpenAI chat completion response.
 */
export function extractResponseText(message: OpenAI.Chat.ChatCompletion): string {
  return message.choices[0]?.message?.content || '';
}
