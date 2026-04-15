import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger, cleanText } from '../lib/scraper-utils';

/**
 * Custom scraper for The Siren Morro Bay
 * Uses Playwright + Cheerio with specific selectors for their event calendar
 */
export class SirenCustomScraper extends BaseScraper {
  name = 'the-siren-morro-bay';
  sourceUrl = 'https://thesirenmorrobay.com/events/list/';
  schedule = '0 */6 * * *';

  async scrape(): Promise<RawEvent[]> {
    let browser;
    try {
      logger.info(`[${this.name}] Launching browser for ${this.sourceUrl}`);

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const allEvents: RawEvent[] = [];
      let currentPage = 1;
      let hasMorePages = true;

      // Scrape all pages
      while (hasMorePages) {
        const pageUrl = currentPage === 1
          ? this.sourceUrl
          : `${this.sourceUrl}page/${currentPage}/`;

        logger.info(`[${this.name}] Scraping page ${currentPage}: ${pageUrl}`);

        await page.goto(pageUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000); // Let events load

        const html = await page.content();
        const $ = cheerio.load(html);
        const events: RawEvent[] = [];

        // Debug: Check what selectors find
        logger.debug(`[${this.name}] Page ${currentPage} - Found ${$('[id="eventList"]').length} eventList elements`);

        // Check for next page
        const nextPageLink = $('a[rel="next"]').attr('href') || $('.next.page-numbers').attr('href');
        hasMorePages = !!nextPageLink && currentPage < 10; // Safety limit of 10 pages

        // The Siren uses #eventList for each event (multiple elements with same ID)
        $('[id="eventList"]').each((_, element) => {
        try {
          const $el = $(element);

          // Title is in .ecs-venue-details a
          const title = cleanText(
            $el.find('.ecs-venue-details a').first().text()
          );

          logger.debug(`[${this.name}] Processing: "${title}"`);

          if (!title || title === 'Free and Ticketed Shows' || title.length === 0) {
            logger.debug(`[${this.name}] Skipping invalid title: "${title}"`);
            return;
          }

          // Date from .tribe-event-date-start
          const dateEl = $el.find('.tribe-event-date-start').first();
          const rawDate = cleanText(dateEl.clone().children().remove().end().text()); // Get text without child spans

          // Time extraction - Siren uses format: "7:00 pm - 10:00 pm"
          // Start time is in a <span> before the dash, end time is in .tribe-event-time
          const dateElFull = $el.find('.tribe-event-date-start').first();
          const timeSpans = dateElFull.find('span');

          let rawTime = '';
          let rawEndTime = '';

          // Extract start and end times from the spans
          timeSpans.each((idx, span) => {
            const text = $(span).text().trim();
            // Look for time patterns (e.g., "7:00 pm", "10:30 pm")
            if (text.match(/\d{1,2}:\d{2}\s*(am|pm)/i)) {
              if (!rawTime) {
                rawTime = text; // First time found is start time
              } else {
                rawEndTime = text; // Second time found is end time
              }
            }
          });

          // Description from .ecs-excerpt
          const rawDescription = cleanText($el.find('.ecs-excerpt').first().text());

          // Event detail URL
          const url = $el.find('.ecs-venue-details a').first().attr('href') || undefined;

          // Ticket URL
          const ticketUrl = $el.find('.ecs-tickets a, .ecs-button a').first().attr('href') || url;

          // Image
          const imageUrl = $el.find('img').first().attr('src') || undefined;

          // Price - look for text with $
          const priceMatch = $el.text().match(/\$\d+/);
          const rawPrice = priceMatch ? priceMatch[0] : '';

          const rawEvent: RawEvent = {
            title,
            rawDate,
            rawTime: rawTime,
            rawEndTime: rawEndTime || undefined, // Include end time if available
            rawDescription,
            rawVenue: 'Siren Morro Bay',
            rawPrice,
            imageUrl,
            url: ticketUrl,
            metadata: {
              scrapedAt: new Date().toISOString(),
              source: this.name,
            },
          };

          events.push(rawEvent);
          logger.debug(`[${this.name}] Parsed event: ${title} on ${rawDate}`);
        } catch (error: any) {
          logger.error(`[${this.name}] Failed to parse event element: ${error.message}`);
        }
        });

        // Only add events if we found new ones (stop if page has no events)
        if (events.length === 0) {
          logger.info(`[${this.name}] Page ${currentPage}: No events found, stopping pagination`);
          hasMorePages = false;
        } else {
          allEvents.push(...events);
          logger.info(`[${this.name}] Page ${currentPage}: Found ${events.length} events (total: ${allEvents.length})`);
          currentPage++;
        }
      }

      await browser.close();

      // Fix dates: events are in chronological order, so if a date is in the past, it's likely next year
      const now = new Date();
      const currentMonth = now.getMonth(); // 0-11

      const adjustedEvents = allEvents.map(event => {
        try {
          let dateStr = `${event.rawDate} ${event.rawTime || ''}`.trim();

          // If date doesn't have a year, we need to figure out which year
          if (!dateStr.match(/\d{4}/)) {
            // Parse month from date string
            const monthMatch = dateStr.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);

            if (monthMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
              const monthShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthStr = monthMatch[1].toLowerCase();

              let eventMonth = monthNames.indexOf(monthStr);
              if (eventMonth === -1) {
                eventMonth = monthShort.indexOf(monthStr.substring(0, 3));
              }

              // If event month is before current month, it's next year
              const year = eventMonth < currentMonth ? now.getFullYear() + 1 : now.getFullYear();
              event.rawDate = `${event.rawDate} ${year}`;
              logger.debug(`[${this.name}] Adjusted year for "${event.title}": ${event.rawDate}`);
            } else {
              // Fallback: add current year
              event.rawDate = `${event.rawDate} ${now.getFullYear()}`;
            }
          }

          return event;
        } catch (error: any) {
          logger.warn(`[${this.name}] Failed to adjust date for event: ${error.message}`);
          return event;
        }
      });

      // Deduplicate events based on title and date
      const uniqueEvents = adjustedEvents.filter((event, index, self) =>
        index === self.findIndex((e) =>
          e.title === event.title && e.rawDate === event.rawDate
        )
      );

      logger.info(`[${this.name}] Total events after deduplication: ${uniqueEvents.length} (removed ${adjustedEvents.length - uniqueEvents.length} duplicates)`);
      return uniqueEvents;

    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      if (browser) await browser.close();
      throw error;
    }
  }
}
