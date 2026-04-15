import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { fetchWithRetry, logger, cleanText } from '../lib/scraper-utils';

/**
 * PAC SLO (Performing Arts Center) scraper using Cheerio
 */
export class PACSLOScraper extends BaseScraper {
  name = 'pac-slo';
  sourceUrl = 'https://www.pacslo.org/events';
  schedule = '0 */12 * * *'; // Every 12 hours

  async scrape(): Promise<RawEvent[]> {
    try {
      logger.info(`[${this.name}] Fetching events from ${this.sourceUrl}`);

      const html = await fetchWithRetry(this.sourceUrl, {
        timeout: this.timeout,
        retries: this.maxRetries,
      });

      const $ = cheerio.load(html);
      const events: RawEvent[] = [];

      // Parse event listings
      $('.event-item, .performance, article.event, .event-listing').each((_, element) => {
        try {
          const $el = $(element);

          // Extract event details
          const title = cleanText(
            $el.find('.event-title, .performance-title, h2, h3').first().text()
          );

          if (!title) return;

          const rawDate = cleanText(
            $el.find('.event-date, .performance-date, .date, time').first().text()
          );

          const rawTime = cleanText(
            $el.find('.event-time, .performance-time, .time').first().text()
          );

          const rawDescription = cleanText(
            $el.find('.event-description, .performance-description, .description').first().text()
          );

          // Extract category if available
          const category = cleanText(
            $el.find('.event-category, .category, .genre').first().text()
          );

          const imageUrl = $el.find('img').first().attr('src') || undefined;

          const ticketUrl =
            $el.find('a.ticket-link, a.buy-tickets, a[href*="ticket"]').first().attr('href') ||
            undefined;

          const rawPrice = cleanText(
            $el.find('.event-price, .price, .admission').first().text()
          );

          const rawHtml = $el.html() || undefined;

          events.push({
            title,
            rawDate,
            rawTime,
            rawDescription,
            rawVenue: 'Performing Arts Center San Luis Obispo',
            rawPrice,
            imageUrl,
            url: ticketUrl,
            rawHtml,
            metadata: {
              scrapedAt: new Date().toISOString(),
              source: this.name,
              category,
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
