import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger } from '../lib/scraper-utils';

/**
 * Generic scraper for venues that publish event calendars as images
 * Uses Claude Vision API to extract event details from calendar images
 */
export class ImageCalendarScraper extends BaseScraper {
  name: string;
  sourceUrl: string;
  venueName: string;
  schedule = '0 0 1 * *'; // Monthly on the 1st

  // Optional: direct image URL pattern (e.g., for monthly calendars)
  private imageUrlPattern?: string;

  constructor(
    scraperId: string,
    sourceUrl: string,
    venueName: string,
    imageUrlPattern?: string
  ) {
    super();
    this.name = scraperId;
    this.sourceUrl = sourceUrl;
    this.venueName = venueName;
    this.imageUrlPattern = imageUrlPattern;
  }

  async scrape(): Promise<RawEvent[]> {
    let browser;
    try {
      logger.info(`[${this.name}] Scraping image-based calendar from ${this.sourceUrl}`);

      let imageUrls: string[] = [];

      if (this.imageUrlPattern) {
        // If we have a pattern, generate image URLs for current and next month
        const now = new Date();
        const currentMonthName = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const currentMonthNum = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();

        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthName = nextMonth.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const nextMonthNum = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const nextYear = nextMonth.getFullYear();

        // Generate URLs for current and next month
        // Pattern supports: {year}, {month} (name), {monthNum} (number)
        imageUrls.push(
          this.imageUrlPattern
            .replace(/{year}/g, currentYear.toString())
            .replace(/{month}/g, currentMonthName)
            .replace(/{monthNum}/g, currentMonthNum),
          this.imageUrlPattern
            .replace(/{year}/g, nextYear.toString())
            .replace(/{month}/g, nextMonthName)
            .replace(/{monthNum}/g, nextMonthNum)
        );

        logger.info(`[${this.name}] Trying image URLs for ${currentMonthName} ${currentYear} and ${nextMonthName} ${nextYear}`);
      } else {
        // Scrape the page to find calendar image URLs
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(this.sourceUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        await page.waitForTimeout(3000);

        // Look for calendar/schedule images
        const images = await page.$$eval('img', (imgs) =>
          imgs
            .map((img) => (img as HTMLImageElement).src)
            .filter((src) =>
              src &&
              (src.includes('calendar') ||
                src.includes('schedule') ||
                src.includes('music') ||
                src.includes('events'))
            )
        );

        await browser.close();
        imageUrls = images;

        logger.info(`[${this.name}] Found ${imageUrls.length} potential calendar images on page`);
      }

      // Extract events from each image
      const allEvents: RawEvent[] = [];

      for (const imageUrl of imageUrls) {
        try {
          logger.info(`[${this.name}] Extracting events from image: ${imageUrl}`);
          const events = await this.extractEventsFromImage(imageUrl);
          allEvents.push(...events);
          logger.info(`[${this.name}] Extracted ${events.length} events from image`);
        } catch (error: any) {
          logger.error(`[${this.name}] Failed to extract from image ${imageUrl}: ${error.message}`);
        }
      }

      logger.info(`[${this.name}] Total events extracted: ${allEvents.length}`);
      return allEvents;

    } catch (error: any) {
      logger.error(`[${this.name}] Image calendar scraping failed: ${error.message}`);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Extract event details from a calendar image using Claude Vision API
   */
  private async extractEventsFromImage(imageUrl: string): Promise<RawEvent[]> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const prompt = `Analyze this music/event calendar image and extract ALL upcoming events/performances.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

CRITICAL: If this is a calendar grid (with days of week across top and dates in cells):
- Pay careful attention to which column each event is in
- Match the event to the correct DATE NUMBER in that column
- Double-check the day-of-week matches the date
- Read the calendar grid LEFT to RIGHT, TOP to BOTTOM

For EACH event/performance shown, extract:
- title: The artist/performer name or event title
- date: The EXACT date from the calendar (e.g., "November 6, 2025" - verify the date number carefully!)
- time: The time if shown (e.g., "5-7pm", "7:00 PM")
- description: Any additional details (genre, special notes, etc.)

CRITICAL RULES:
1. CAREFULLY read calendar grid dates - do not shift dates by mistake
2. Extract ALL actual events/performances - do not skip any
3. SKIP entries like "No music", "Closed", "Private event" (these are NOT events)
4. Return ONLY valid JSON array - no markdown, no explanations
5. Only include FUTURE events (after ${new Date().toISOString().split('T')[0]})
6. If you cannot read the image or no events found, return: []

Return format:
[
  {
    "title": "Artist/Performer Name",
    "date": "November 6, 2025",
    "time": "5-7pm",
    "description": "Duo, Rock/Country"
  }
]

Analyze the image carefully and extract all events:`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: imageUrl,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      // Parse JSON response
      let cleanedResponse = content.text.trim();
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }

      const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn(`[${this.name}] No JSON found in Claude response`);
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) {
        logger.warn(`[${this.name}] Response is not an array`);
        return [];
      }

      // Convert to RawEvent format and filter out non-events
      const nonEventKeywords = /no music|closed|private event|tbd|cancelled|n\/a/i;

      const events: RawEvent[] = parsed
        .filter((event: any) => {
          // Skip entries that aren't actual events
          if (nonEventKeywords.test(event.title)) {
            logger.debug(`[${this.name}] Skipping non-event: ${event.title}`);
            return false;
          }
          return true;
        })
        .map((event: any) => ({
          title: event.title || 'Untitled Event',
          rawDate: event.date,
          rawTime: event.time,
          rawVenue: this.venueName,
          rawPrice: '',
          rawDescription: event.description || 'Live Music',
          imageUrl: imageUrl,
          url: this.sourceUrl,
          metadata: {
            source: this.name,
            scrapedAt: new Date().toISOString(),
            extractionMethod: 'claude-vision-calendar',
            calendarImageUrl: imageUrl,
          },
        }));

      return events;

    } catch (error: any) {
      logger.error(`[${this.name}] Vision extraction failed: ${error.message}`);
      return [];
    }
  }
}
