import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { fetchWithRetry, logger } from '../lib/scraper-utils';
import {
  callClaude,
  parseClaudeResponse,
  validateAndMapEvents,
  extractResponseText,
} from '../lib/claude-scraper-utils';

/**
 * Universal scraper that uses Claude to extract events from any webpage
 * This is perfect for venues with dynamic or complex HTML structures
 */
export class ClaudeUniversalScraper extends BaseScraper {
  name: string;
  sourceUrl: string;
  venueName: string;
  schedule = '0 */6 * * *'; // Every 6 hours

  constructor(name: string, sourceUrl: string, venueName: string) {
    super();
    this.name = name;
    this.sourceUrl = sourceUrl;
    this.venueName = venueName;
  }

  async scrape(): Promise<RawEvent[]> {
    try {
      logger.info(`[${this.name}] Fetching events from ${this.sourceUrl} using Claude`);

      // Fetch the webpage
      const html = await fetchWithRetry(this.sourceUrl, {
        timeout: this.timeout,
        retries: this.maxRetries,
      });

      // For large pages, split into chunks to get all events
      const chunkSize = 150000; // ~150KB per chunk to stay within token limits
      const chunks: string[] = [];

      if (html.length > chunkSize) {
        logger.info(`[${this.name}] Large page (${html.length} bytes), splitting into chunks`);

        // Split HTML into overlapping chunks to avoid cutting events in half
        for (let i = 0; i < html.length; i += chunkSize * 0.8) {
          const chunk = html.substring(i, i + chunkSize);
          chunks.push(chunk);

          if (i + chunkSize >= html.length) break;
        }

        logger.info(`[${this.name}] Split into ${chunks.length} chunks`);
      } else {
        chunks.push(html);
      }

      // Process each chunk and collect all events
      const allEvents: RawEvent[] = [];

      for (let i = 0; i < chunks.length; i++) {
        logger.info(`[${this.name}] Processing chunk ${i + 1}/${chunks.length}`);

        const events = await this.extractEventsFromHtml(chunks[i]);
        allEvents.push(...events);

        logger.info(`[${this.name}] Chunk ${i + 1}: Found ${events.length} events (total: ${allEvents.length})`);
      }

      // Deduplicate events based on title and date (in case chunks overlapped)
      const uniqueEvents = allEvents.filter((event, index, self) =>
        index === self.findIndex((e) =>
          e.title === event.title && e.rawDate === event.rawDate
        )
      );

      logger.info(`[${this.name}] Total unique events after deduplication: ${uniqueEvents.length} (removed ${allEvents.length - uniqueEvents.length} duplicates)`);

      return uniqueEvents;

    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract events from HTML chunk using Claude
   */
  private async extractEventsFromHtml(html: string): Promise<RawEvent[]> {
    try {
      const sourceDomain = new URL(this.sourceUrl).hostname;
      const prompt = `You are an expert at extracting event information from HTML.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
SOURCE DOMAIN: ${new URL(this.sourceUrl).origin}

Extract ALL FUTURE/UPCOMING events from this HTML (ignore past events). IMPORTANT: Extract EVERY single upcoming event you find - do not limit yourself to just a few. For each event, extract:
- title (event name - required)
- rawDate (date text as it appears - required)
- rawTime (time text as it appears - optional)
- rawDescription (description or details - optional, can be empty string)
- rawPrice (price text like "$20" or "Free" - optional, can be empty string)
- imageUrl (IMPORTANT: Be aggressive about finding images! Look for:
  * <img> tags with src attributes near the event
  * Background images in style attributes: style="background-image: url(...)"
  * CSS background properties: background: url(...)
  * Images in parent/container divs of the event
  * Poster or thumbnail images
  * Event promotional graphics
  * Logo images
  Return FULL URL starting with http:// or https://. If relative URL like /images/event.jpg, convert to full URL using ${new URL(this.sourceUrl).origin} as base.
  Set to null ONLY if absolutely no images found)
- url (full URL to ticket or event page - optional, can be null)

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no explanations, no code blocks
2. Return ONLY events that actually exist on the page - DO NOT make up or invent events
3. If you see an events calendar but no actual events listed, return: []
4. All URLs must be complete and actually present in the HTML
5. All dates must be explicitly shown in the HTML - do not guess dates
6. IMAGE EXTRACTION IS CRITICAL: Check every <img> tag, style attribute, and inline CSS for images. Look in event containers, parent divs, and associated elements.

If no events found or page is empty, return: []

HTML:
${html}`;

      const message = await callClaude(prompt, this.name);
      const responseText = extractResponseText(message);
      const extractedEvents = parseClaudeResponse(responseText, this.name);

      return validateAndMapEvents(extractedEvents, {
        scraperName: this.name,
        venueName: this.venueName,
        extractionMethod: 'claude-ai',
        sourceDomain,
      });
    } catch (error: any) {
      logger.error(`[${this.name}] Event extraction from HTML failed: ${error.message}`);
      return [];
    }
  }
}
