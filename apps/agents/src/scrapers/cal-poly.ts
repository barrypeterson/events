import { chromium, Browser, Page } from 'playwright';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger, cleanText } from '../lib/scraper-utils';

/**
 * Cal Poly Events Calendar scraper using Playwright (Trumba calendar)
 */
export class CalPolyScraper extends BaseScraper {
  name = 'cal-poly';
  sourceUrl = 'https://eventscalendar.calpoly.edu';
  schedule = '0 0 * * *'; // Every 24 hours (daily)

  async scrape(): Promise<RawEvent[]> {
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      logger.info(`[${this.name}] Launching browser for ${this.sourceUrl}`);

      browser = await chromium.launch({
        headless: true,
        timeout: this.timeout,
      });

      page = await browser.newPage();
      await page.goto(this.sourceUrl, {
        waitUntil: 'networkidle',
        timeout: this.timeout,
      });

      // Wait for Trumba calendar to load
      await page.waitForSelector('.twEventListItem, .event-item, [id*="event"]', {
        timeout: 15000,
      }).catch(() => {
        logger.warn(`[${this.name}] Event selector not found, trying alternate selectors`);
      });

      // Give calendar time to fully render
      await page.waitForTimeout(2000);

      // Extract events from Trumba calendar
      const events = await page.evaluate(() => {
        const eventElements = document.querySelectorAll(
          '.twEventListItem, .event-item, [class*="event"], [id*="event"]'
        );

        const results: any[] = [];

        eventElements.forEach((el) => {
          try {
            const titleEl = el.querySelector('.twEventTitle, .event-title, h2, h3, a');
            const title = titleEl?.textContent?.trim();

            if (!title || title.length < 3) return;

            const dateEl = el.querySelector('.twEventDate, .event-date, .date, time');
            const rawDate = dateEl?.textContent?.trim();

            const timeEl = el.querySelector('.twEventTime, .event-time, .time');
            const rawTime = timeEl?.textContent?.trim();

            const descEl = el.querySelector('.twEventDescription, .description, p');
            const rawDescription = descEl?.textContent?.trim();

            const locationEl = el.querySelector('.twEventLocation, .location, .venue');
            const rawVenue = locationEl?.textContent?.trim() || 'Cal Poly Campus';

            const imgEl = el.querySelector('img');
            const imageUrl = imgEl?.getAttribute('src');

            const linkEl = el.querySelector('a');
            const ticketUrl = linkEl?.getAttribute('href');

            const categoryEl = el.querySelector('.twEventCategory, .category');
            const category = categoryEl?.textContent?.trim();

            results.push({
              title,
              rawDate,
              rawTime,
              rawDescription,
              rawVenue,
              imageUrl,
              url: ticketUrl,
              rawHtml: el.outerHTML.substring(0, 1000),
              metadata: {
                category,
                isCalPolyEvent: true,
              },
            });
          } catch (error) {
            console.error('Failed to parse event:', error);
          }
        });

        return results;
      });

      logger.info(`[${this.name}] Scraped ${events.length} events`);

      // Add metadata
      const rawEvents: RawEvent[] = events.map((e) => ({
        ...e,
        metadata: {
          ...e.metadata,
          scrapedAt: new Date().toISOString(),
          source: this.name,
        },
      }));

      return rawEvents;
    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      throw error;
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  }
}
