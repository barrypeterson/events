import { chromium, Page, Browser } from 'playwright';
import OpenAI from 'openai';
import { BaseScraper } from './base';
import { RawEvent } from '../types';
import { logger } from '../lib/scraper-utils';
import { ServiceRateLimiter } from '../lib/rate-limiter';

/**
 * Instagram scraper using Claude Vision API to extract event details from images
 *
 * ⚠️ WARNING: This scraper uses authenticated access which violates Instagram ToS
 * - Use ONLY for educational/testing purposes
 * - Use dedicated account (not personal)
 * - High risk of account ban
 * - Very conservative rate limiting to minimize detection
 *
 * This scraper:
 * 1. Logs into Instagram (if credentials provided)
 * 2. Navigates to venue profile
 * 3. Collects recent post images
 * 4. Uses Claude Vision to extract event information from each image
 * 5. Returns structured event data
 */
export class InstagramVisionScraper extends BaseScraper {
  name: string;
  sourceUrl: string;
  schedule = '0 0 * * *'; // Daily at midnight

  private instagramUsername: string;
  private venueName: string;
  private maxPosts: number;
  private rateLimiter: ServiceRateLimiter;
  private static sharedBrowser: Browser | null = null;
  private static isLoggedIn: boolean = false;

  constructor(
    scraperId: string,
    instagramUsername: string,
    venueName: string,
    maxPosts: number = 10
  ) {
    super();
    this.name = scraperId;
    this.instagramUsername = instagramUsername;
    this.venueName = venueName;
    this.maxPosts = Math.min(maxPosts, 10); // Hard cap at 10 posts
    this.sourceUrl = `https://www.instagram.com/${instagramUsername}/`;

    // Very conservative rate limiting: 10 requests per hour by default
    const maxRequests = parseInt(process.env.INSTAGRAM_RATE_LIMIT_REQUESTS || '10');
    const windowSeconds = parseInt(process.env.INSTAGRAM_RATE_LIMIT_WINDOW || '3600');
    this.rateLimiter = new ServiceRateLimiter('instagram', maxRequests, windowSeconds);
  }

  async scrape(): Promise<RawEvent[]> {
    let browser;
    try {
      // Check rate limit before proceeding
      const rateLimitStatus = await this.rateLimiter.checkAndRecord(this.instagramUsername);

      if (!rateLimitStatus.allowed) {
        logger.warn(`[${this.name}] Rate limit exceeded. Skipping scrape. Reset at: ${rateLimitStatus.resetAt}`);
        return [];
      }

      logger.info(`[${this.name}] Rate limit: ${rateLimitStatus.currentCount}/${this.rateLimiter['maxRequests']} requests used`);
      logger.info(`[${this.name}] Launching browser for Instagram: ${this.sourceUrl}`);

      browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
        ]
      });

      const page = await browser.newPage({
        // Realistic user agent (recent Chrome on macOS)
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });

      // Set additional headers to appear more like real browser
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      });

      // Login if credentials provided
      if (process.env.INSTAGRAM_USERNAME && process.env.INSTAGRAM_PASSWORD && !InstagramVisionScraper.isLoggedIn) {
        await this.login(page);
        InstagramVisionScraper.isLoggedIn = true;
      }

      // Navigate to Instagram profile
      await page.goto(this.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Human-like delay
      await page.waitForTimeout(3000 + Math.random() * 2000);

      // Get recent post images
      const postImages = await this.collectPostImages(page);
      logger.info(`[${this.name}] Found ${postImages.length} post images`);

      await browser.close();

      // Extract event details from each image using Claude Vision
      const events: RawEvent[] = [];

      for (const imageData of postImages) {
        try {
          const eventData = await this.extractEventFromImage(imageData);

          if (eventData) {
            events.push(eventData);
            logger.info(`[${this.name}] Extracted event from image: ${eventData.title}`);
          }
        } catch (error: any) {
          logger.error(`[${this.name}] Failed to extract event from image: ${error.message}`);
        }
      }

      logger.info(`[${this.name}] Extracted ${events.length} events from ${postImages.length} images`);
      return events;

    } catch (error: any) {
      logger.error(`[${this.name}] Instagram scraping failed: ${error.message}`);
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Login to Instagram
   * ⚠️ Educational purposes only - violates Instagram ToS
   */
  private async login(page: Page): Promise<void> {
    try {
      logger.info(`[${this.name}] Logging into Instagram...`);

      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Wait for login form
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });

      // Fill credentials with human-like typing delays
      await page.fill('input[name="username"]', process.env.INSTAGRAM_USERNAME!, { delay: 100 });
      await page.waitForTimeout(500 + Math.random() * 500);

      await page.fill('input[name="password"]', process.env.INSTAGRAM_PASSWORD!, { delay: 100 });
      await page.waitForTimeout(500 + Math.random() * 500);

      // Submit login
      await page.click('button[type="submit"]');

      // Wait for navigation
      await page.waitForTimeout(5000);

      // Handle "Save Login Info" prompt if it appears
      try {
        const notNowButton = await page.$('button:has-text("Not Now")');
        if (notNowButton) {
          await notNowButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        // Prompt may not appear
      }

      // Handle "Turn on Notifications" prompt if it appears
      try {
        const notNowButton = await page.$('button:has-text("Not Now")');
        if (notNowButton) {
          await notNowButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        // Prompt may not appear
      }

      logger.info(`[${this.name}] Login completed`);

    } catch (error: any) {
      logger.error(`[${this.name}] Login failed: ${error.message}`);
      throw new Error('Instagram login failed - credentials may be invalid or account blocked');
    }
  }

  /**
   * Collect post images from Instagram profile
   */
  private async collectPostImages(page: Page): Promise<Array<{ url: string; caption: string; postUrl: string }>> {
    const images: Array<{ url: string; caption: string; postUrl: string }> = [];

    try {
      // Wait for posts to load
      await page.waitForSelector('article img', { timeout: 10000 });

      // Get post links and images
      const posts = await page.$$eval('article a[href*="/p/"]', (links) =>
        links.slice(0, 10).map((link) => ({
          url: (link as HTMLAnchorElement).href,
          imageUrl: (link.querySelector('img') as HTMLImageElement)?.src || '',
        }))
      );

      // For each post, get the full image and caption
      for (const post of posts.slice(0, this.maxPosts)) {
        if (!post.imageUrl) continue;

        try {
          // Human-like delay between requests (3-6 seconds)
          const delay = 3000 + Math.random() * 3000;
          await page.waitForTimeout(delay);

          // Visit individual post to get caption
          await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000 + Math.random() * 1000);

          // Get caption text
          const caption = await page.evaluate(() => {
            const metaDesc = document.querySelector('meta[property="og:description"]');
            return metaDesc?.getAttribute('content') || '';
          });

          // Get high-res image URL
          const imageUrl = await page.evaluate(() => {
            const metaImage = document.querySelector('meta[property="og:image"]');
            return metaImage?.getAttribute('content') || '';
          });

          if (imageUrl) {
            images.push({
              url: imageUrl,
              caption: caption,
              postUrl: post.url,
            });

            logger.debug(`[${this.name}] Collected image ${images.length}/${this.maxPosts}`);
          }

          // Go back to profile with delay
          await page.waitForTimeout(2000 + Math.random() * 1000);
          await page.goto(this.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1000 + Math.random() * 1000);

        } catch (error: any) {
          logger.warn(`[${this.name}] Failed to get post details: ${error.message}`);
        }
      }

    } catch (error: any) {
      logger.error(`[${this.name}] Failed to collect images: ${error.message}`);
    }

    return images;
  }

  /**
   * Extract event details from an image using Claude Vision API
   */
  private async extractEventFromImage(
    imageData: { url: string; caption: string; postUrl: string }
  ): Promise<RawEvent | null> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Analyze this image and extract event information if it's an event poster or announcement.

Look for:
- Event title/name
- Date and time
- Venue/location
- Price/cost
- Any other relevant details

If this is NOT an event poster, return { "isEvent": false }.

If this IS an event poster, return a JSON object with:
{
  "isEvent": true,
  "title": "event name",
  "date": "date string (e.g., 'Oct 25', 'November 15')",
  "time": "time string (e.g., '8:00 PM', '7-10 PM')",
  "venue": "venue name if mentioned",
  "price": "price info if mentioned",
  "description": "any additional details"
}

Instagram caption for context: "${imageData.caption.substring(0, 500)}"

Return ONLY the JSON object, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageData.url,
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

      // Parse JSON response
      const jsonMatch = (response.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`[${this.name}] No JSON found in Claude response`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Check if it's an event
      if (!parsed.isEvent || parsed.isEvent === false) {
        logger.debug(`[${this.name}] Image is not an event poster`);
        return null;
      }

      // Convert to RawEvent
      const rawEvent: RawEvent = {
        title: parsed.title || 'Untitled Event',
        rawDate: parsed.date,
        rawTime: parsed.time,
        rawVenue: parsed.venue || this.venueName,
        rawPrice: parsed.price,
        rawDescription: parsed.description || imageData.caption.substring(0, 500),
        imageUrl: imageData.url,
        url: imageData.postUrl,
        metadata: {
          source: this.name,
          scrapedAt: new Date().toISOString(),
          instagramUsername: this.instagramUsername,
          extractionMethod: 'claude-vision',
        },
      };

      return rawEvent;

    } catch (error: any) {
      logger.error(`[${this.name}] Vision extraction failed: ${error.message}`);
      return null;
    }
  }
}
