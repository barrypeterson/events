import { chromium } from 'playwright';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger } from '../lib/scraper-utils';
import {
  callClaude,
  parseClaudeResponse,
  validateAndMapEvents,
  extractResponseText,
} from '../lib/claude-scraper-utils';

/**
 * Claude scraper using Playwright for JavaScript-heavy websites
 * Use this for sites that load events dynamically with JavaScript
 */
export class ClaudePlaywrightScraper extends BaseScraper {
  name: string;
  sourceUrl: string;
  venueName: string;
  schedule = '0 */6 * * *';

  constructor(name: string, sourceUrl: string, venueName: string) {
    super();
    this.name = name;
    this.sourceUrl = sourceUrl;
    this.venueName = venueName;
  }

  async scrape(): Promise<RawEvent[]> {
    let browser;
    try {
      logger.info(`[${this.name}] Launching browser for ${this.sourceUrl}`);

      browser = await chromium.launch({ headless: true });

      // Create context with realistic browser fingerprint to avoid bot detection
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        geolocation: { latitude: 35.2828, longitude: -120.6596 }, // San Luis Obispo
        permissions: ['geolocation'],
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
      });

      const page = await context.newPage();

      // Navigate and wait for page to fully load
      await page.goto(this.sourceUrl, { waitUntil: 'networkidle' });

      // Wait a bit for any lazy-loaded content
      await page.waitForTimeout(3000);

      // Get the fully rendered HTML
      const html = await page.content();

      await browser.close();

      // Truncate if too long (150KB allows most event pages to fit)
      const truncatedHtml = html.length > 150000 ? html.substring(0, 150000) + '...[truncated]' : html;

      logger.info(`[${this.name}] HTML size: ${html.length} bytes, truncated to: ${truncatedHtml.length} bytes`);

      // Ask Claude to extract events
      logger.info(`[${this.name}] Asking Claude to extract events from rendered HTML`);

      const prompt = `You are an expert at extracting event information from HTML.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

Extract ONLY FUTURE/UPCOMING events from this HTML (ignore past events). For each event, extract:
- title (event name - required)
- rawDate (date text as it appears - required)
- rawTime (time text as it appears - optional)
- rawDescription (description or details - optional, can be empty string)
- rawPrice (price text like "$20" or "Free" - optional, can be empty string)
- imageUrl (full URL to event image - optional, can be null)
- url (full URL to ticket or event page - optional, can be null)

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no explanations, no code blocks
2. Return ONLY events that actually exist on the page - DO NOT make up or invent events
3. If you see an events calendar but no actual events listed, return: []
4. All URLs must be complete and actually present in the HTML
5. All dates must be explicitly shown in the HTML - do not guess dates

If no events found or page is empty, return: []

HTML:
${truncatedHtml}`;

      const message = await callClaude(prompt, this.name);
      const responseText = extractResponseText(message);
      const extractedEvents = parseClaudeResponse(responseText, this.name);
      const sourceDomain = new URL(this.sourceUrl).hostname;

      const events = validateAndMapEvents(extractedEvents, {
        scraperName: this.name,
        venueName: this.venueName,
        extractionMethod: 'claude-playwright',
        sourceDomain,
      });

      logger.info(`[${this.name}] Claude extracted ${extractedEvents.length} events, ${events.length} are upcoming`);
      return events;

    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      if (browser) await browser.close();
      throw error;
    }
  }
}
