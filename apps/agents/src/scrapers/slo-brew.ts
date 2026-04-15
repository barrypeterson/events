import { chromium, Browser, Page } from 'playwright';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger, cleanText } from '../lib/scraper-utils';

/**
 * SLO Brew scraper using Playwright for JavaScript-heavy site
 */
export class SLOBrewScraper extends BaseScraper {
  name = 'slo-brew';
  sourceUrl = 'https://slobrew.com/events';
  schedule = '0 */6 * * *'; // Every 6 hours

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

      // Wait for events to load
      await page.waitForSelector('.event-grid, .events-container, .event-item', {
        timeout: 10000,
      }).catch(() => {
        logger.warn(`[${this.name}] Event selector not found, continuing anyway`);
      });

      // Extract events from page
      const events = await page.evaluate(() => {
        const eventElements = document.querySelectorAll(
          '.event-item, .event-card, article.event, [class*="event"]'
        );

        const results: any[] = [];

        eventElements.forEach((el) => {
          try {
            const titleEl = el.querySelector('h2, h3, .event-title, .title, [class*="title"]');
            const title = titleEl?.textContent?.trim();

            if (!title) return;

            const dateEl = el.querySelector('.event-date, .date, time, [class*="date"]');
            const rawDate = dateEl?.textContent?.trim();

            const timeEl = el.querySelector('.event-time, .time, [class*="time"]');
            const rawTime = timeEl?.textContent?.trim();

            const descEl = el.querySelector('.description, .event-description, p');
            const rawDescription = descEl?.textContent?.trim();

            const imgEl = el.querySelector('img');
            const imageUrl = imgEl?.getAttribute('src');

            const linkEl = el.querySelector('a[href*="ticket"], a.buy, a.event-link');
            const ticketUrl = linkEl?.getAttribute('href');

            const priceEl = el.querySelector('.price, .event-price, [class*="price"]');
            const rawPrice = priceEl?.textContent?.trim();

            results.push({
              title,
              rawDate,
              rawTime,
              rawDescription,
              rawVenue: 'SLO Brew Rock',
              rawPrice,
              imageUrl,
              url: ticketUrl,
              rawHtml: el.outerHTML.substring(0, 1000),
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
