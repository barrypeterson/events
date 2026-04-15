import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { fetchWithRetry, logger, cleanText } from '../lib/scraper-utils';

/**
 * Fremont Theater scraper using Cheerio for HTML parsing
 */
export class FremontTheaterScraper extends BaseScraper {
  name = 'fremont-theater';
  sourceUrl = 'https://www.fremontslo.com/shows';
  schedule = '0 */6 * * *'; // Every 6 hours

  async scrape(): Promise<RawEvent[]> {
    try {
      logger.info(`[${this.name}] Fetching events from ${this.sourceUrl}`);

      const html = await fetchWithRetry(this.sourceUrl, {
        timeout: this.timeout,
        retries: this.maxRetries,
      });

      const $ = cheerio.load(html);
      const events: RawEvent[] = [];

      // Parse event listings - Fremont uses <a> tags for each event
      $('a[href*="/event/"], a[href*="/show/"]').each((_, element) => {
        try {
          const $el = $(element);

          // Extract event details
          const title = cleanText(
            $el.find('.event-title, .show-title, h2, h3').first().text()
          );

          if (!title) return; // Skip if no title

          const rawDate = cleanText(
            $el.find('.event-date, .show-date, .date, time').first().text()
          );

          const rawTime = cleanText(
            $el.find('.event-time, .show-time, .time').first().text()
          );

          const rawDescription = cleanText(
            $el.find('.event-description, .show-description, .description, p').first().text()
          );

          const imageUrl = $el.find('img').first().attr('src') || undefined;

          const ticketUrl =
            $el.find('a.ticket-link, a.buy-tickets, a[href*="ticket"]').first().attr('href') ||
            undefined;

          const rawPrice = cleanText(
            $el.find('.event-price, .show-price, .price').first().text()
          );

          const rawHtml = $el.html() || undefined;

          events.push({
            title,
            rawDate,
            rawTime,
            rawDescription,
            rawVenue: 'Fremont Theater',
            rawPrice,
            imageUrl,
            url: ticketUrl,
            rawHtml,
            metadata: {
              scrapedAt: new Date().toISOString(),
              source: this.name,
            },
          });

          logger.debug(`[${this.name}] Parsed event: ${title}`);
        } catch (error: any) {
          logger.error(`[${this.name}] Failed to parse event element: ${error.message}`);
        }
      });

      logger.info(`[${this.name}] Scraped ${events.length} events`);
      return events;
    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      throw error;
    }
  }
}
