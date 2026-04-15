import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger } from '../lib/scraper-utils';

let anthropicInstance: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicInstance;
}

/**
 * Cal Poly Athletics scraper for home games
 * Uses Playwright to handle JavaScript-rendered content
 * Filters for HOME games only and categorizes as SPORTS
 */
export class CalPolyAthleticsScraper extends BaseScraper {
  name = 'cal-poly-athletics';
  sourceUrl = 'https://gopoly.com/calendar?view=list'; // List view may load faster
  schedule = '0 0 * * *'; // Daily at midnight

  // Main sports to scrape
  private sportUrls = [
    'https://gopoly.com/sports/football/schedule',
    'https://gopoly.com/sports/mens-basketball/schedule',
    'https://gopoly.com/sports/womens-basketball/schedule',
    'https://gopoly.com/sports/mens-soccer/schedule',
    'https://gopoly.com/sports/womens-soccer/schedule',
    'https://gopoly.com/sports/volleyball/schedule',
  ];

  async scrape(): Promise<RawEvent[]> {
    let browser;
    try {
      logger.info(`[${this.name}] Scraping Cal Poly Athletics home games from individual sport pages`);

      const allEvents: RawEvent[] = [];

      browser = await chromium.launch({ headless: true });

      // Scrape each sport's schedule page individually
      for (const sportUrl of this.sportUrls) {
        try {
          const sportName = sportUrl.split('/')[4].replace('mens-', "Men's ").replace('womens-', "Women's ").replace(/-/g, ' ');
          logger.info(`[${this.name}] Scraping ${sportName} from ${sportUrl}`);

          const page = await browser.newPage();

          // Navigate with reasonable timeout
          await page.goto(sportUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          });

          // Wait for schedule to load
          await page.waitForTimeout(5000);

          // Get the HTML
          const html = await page.content();
          await page.close();

          // Extract events from this sport's page
          const sportEvents = await this.extractGamesFromHtml(html, sportName);
          allEvents.push(...sportEvents);

          logger.info(`[${this.name}] Found ${sportEvents.length} home games for ${sportName}`);

        } catch (error: any) {
          logger.error(`[${this.name}] Failed to scrape ${sportUrl}: ${error.message}`);
          // Continue with other sports
        }
      }

      await browser.close();

      logger.info(`[${this.name}] Total home games found: ${allEvents.length}`);
      return allEvents;

    } catch (error: any) {
      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Extract home games from a sport's schedule HTML
   */
  private async extractGamesFromHtml(html: string, sportName: string): Promise<RawEvent[]> {
    try {
      // Truncate if too long
      const truncatedHtml = html.length > 150000 ? html.substring(0, 150000) + '...[truncated]' : html;

      const message = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `You are an expert at extracting sports schedule information from HTML.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
SPORT: ${sportName}

Extract ONLY HOME GAMES (NOT away games) from this ${sportName} schedule page.

For each HOME game, extract:
- title (format as: "Cal Poly ${sportName} vs [Opponent]")
- rawDate (date text - required)
- rawTime (time text - optional)
- rawVenue (venue/stadium name if shown, otherwise "Cal Poly")
- opponent (opponent team name)
- imageUrl (IMPORTANT: Look for ANY image associated with this game or sport. Check for:
  * Team logos in <img> tags
  * Sport/event promotional images
  * Background images in CSS (style="background-image: url(...)")
  * Images in parent containers or linked pages
  * Opponent team logos
  * Any promotional graphics for the game
  Return the FULL URL (starting with http:// or https://). If relative URL like /images/logo.png, convert to full URL using https://gopoly.com as base.
  If absolutely no images found, set to null)

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no explanations
2. Extract ONLY HOME games (look for home indicator, venue name, or vs/VS format)
3. IGNORE away games (usually marked with @ symbol or "at" before opponent)
4. Return ONLY FUTURE/UPCOMING games (after ${new Date().toISOString().split('T')[0]})
5. If no home games found, return: []
6. Be aggressive about finding images - check all <img> tags, style attributes, and CSS background-image properties

Example output:
[
  {
    "title": "Cal Poly Football vs UC Davis",
    "rawDate": "October 4, 2025",
    "rawTime": "6:00 PM",
    "rawVenue": "Alex G. Spanos Stadium",
    "opponent": "UC Davis",
    "imageUrl": "https://gopoly.com/images/2025/10/4/football_game.jpg"
  }
]

HTML:
${truncatedHtml}`
        }]
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

      // Clean up response
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }

      const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn(`[${this.name}] Claude did not return valid JSON`);
        return [];
      }

      let extractedGames;
      try {
        extractedGames = JSON.parse(jsonMatch[0]);
      } catch (parseError: any) {
        logger.error(`[${this.name}] JSON parse error: ${parseError.message}`);
        return [];
      }

      // Convert to RawEvent format
      const now = new Date();
      const events: RawEvent[] = extractedGames
        .map((game: any) => ({
          title: game.title || `Cal Poly ${sportName} vs ${game.opponent}`,
          rawDate: game.rawDate,
          rawTime: game.rawTime,
          rawDescription: `${sportName} - Home Game`,
          rawVenue: game.rawVenue || 'Cal Poly',
          rawPrice: '',
          imageUrl: game.imageUrl || undefined,
          url: this.sourceUrl,
          metadata: {
            scrapedAt: new Date().toISOString(),
            source: this.name,
            sport: sportName,
            opponent: game.opponent,
            extractionMethod: 'claude-playwright',
            eventType: 'athletics',
          },
        }))
        .filter((event: RawEvent) => {
          // Filter out past events
          try {
            const dateStr = `${event.rawDate} ${event.rawTime || ''}`.trim();
            const eventDate = new Date(dateStr);

            if (!isNaN(eventDate.getTime()) && eventDate < now) {
              return false;
            }
          } catch (error) {
            // Keep it if we can't parse the date
          }
          return true;
        });

      return events;

    } catch (error: any) {
      logger.error(`[${this.name}] Failed to extract games from ${sportName} HTML: ${error.message}`);
      return [];
    }
  }
}
