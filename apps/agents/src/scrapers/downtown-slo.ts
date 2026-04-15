import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { fetchWithRetry, logger, cleanText } from '../lib/scraper-utils';

/**
 * Downtown SLO community events scraper using Cheerio
 */
export class DowntownSLOScraper extends BaseScraper {
  name = 'downtown-slo';
  sourceUrl = 'https://downtownslo.com/events';
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
      $('.event-item, .event-card, article.event, .tribe-event, .event').each((_, element) => {
        try {
          const $el = $(element);

          // Extract event details
          const title = cleanText(
            $el.find('.event-title, .tribe-event-title, h2, h3, a.event-link').first().text()
          );

          if (!title) return;

          const rawDate = cleanText(
            $el.find('.event-date, .tribe-event-date, .date, time, .event-schedule').first().text()
          );

          const rawTime = cleanText(
            $el.find('.event-time, .tribe-event-time, .time').first().text()
          );

          const rawDescription = cleanText(
            $el.find('.event-description, .tribe-event-description, .description, p').first().text()
          );

          // Extract venue from event
          const rawVenue = cleanText(
            $el.find('.event-venue, .tribe-event-venue, .venue, .location').first().text()
          ) || 'Downtown San Luis Obispo';

          const imageUrl = $el.find('img').first().attr('src') || undefined;

          const ticketUrl =
            $el.find('a.event-link, a[href*="event"], a.more-link').first().attr('href') ||
            undefined;

          const rawPrice = cleanText(
            $el.find('.event-price, .price, .cost, .admission').first().text()
          );

          // Check if it's a free event
          const isFree =
            rawPrice?.toLowerCase().includes('free') ||
            $el.find('.free-event, .free-admission').length > 0;

          const rawHtml = $el.html() || undefined;

          events.push({
            title,
            rawDate,
            rawTime,
            rawDescription,
            rawVenue,
            rawPrice: isFree ? 'Free' : rawPrice,
            imageUrl,
            url: ticketUrl,
            rawHtml,
            metadata: {
              scrapedAt: new Date().toISOString(),
              source: this.name,
              isCommunityEvent: true,
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
