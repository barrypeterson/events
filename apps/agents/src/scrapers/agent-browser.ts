import { execFileSync } from 'child_process';
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
 * Performance metrics for comparing scraper approaches
 */
export interface ScraperMetrics {
  fetchMethod: 'agent-browser' | 'playwright' | 'fetch';
  pageLoadTimeMs: number;
  snapshotSizeBytes: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  totalTimeMs: number;
  eventsExtracted: number;
}

/**
 * Agent Browser scraper using Vercel's agent-browser CLI
 *
 * Benefits over ClaudePlaywrightScraper:
 * - 93% less context usage (accessibility tree vs full HTML)
 * - Built-in element refs for interaction (@e1, @e2, etc.)
 * - Session management for parallel scraping
 * - Persistent profiles for auth persistence
 * - Mobile Safari support via iOS Simulator
 *
 * @see https://github.com/vercel-labs/agent-browser
 */
export class AgentBrowserScraper extends BaseScraper {
  name: string;
  sourceUrl: string;
  venueName: string;
  schedule = '0 */6 * * *';

  // Agent browser specific options
  protected sessionId?: string;
  protected profilePath?: string;
  protected waitForSelector?: string;
  protected interactiveOnly: boolean = false; // Changed to false - we need text content like dates
  protected compactSnapshot: boolean = true;
  protected maxDepth: number = 15; // Increased depth to capture nested content
  protected userAgent: string =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Metrics for comparison
  public lastMetrics?: ScraperMetrics;

  constructor(
    name: string,
    sourceUrl: string,
    venueName: string,
    options?: {
      sessionId?: string;
      profilePath?: string;
      waitForSelector?: string;
      interactiveOnly?: boolean;
      compactSnapshot?: boolean;
      maxDepth?: number;
    }
  ) {
    super();
    this.name = name;
    this.sourceUrl = sourceUrl;
    this.venueName = venueName;

    if (options) {
      this.sessionId = options.sessionId;
      this.profilePath = options.profilePath;
      this.waitForSelector = options.waitForSelector;
      this.interactiveOnly = options.interactiveOnly ?? true;
      this.compactSnapshot = options.compactSnapshot ?? true;
      this.maxDepth = options.maxDepth ?? 10;
    }
  }

  /**
   * Build argument array for agent-browser commands (avoids shell injection)
   */
  private buildArgs(...commandArgs: string[]): string[] {
    const args: string[] = [];
    if (this.sessionId) args.push('--session', this.sessionId);
    if (this.profilePath) args.push('--profile', this.profilePath);
    args.push('--user-agent', this.userAgent);
    args.push(...commandArgs);
    return args;
  }

  /**
   * Execute an agent-browser command safely using execFileSync (no shell interpolation)
   */
  private execAgentBrowser(command: string, ...extraArgs: string[]): string {
    const args = this.buildArgs(command, ...extraArgs);

    logger.debug(`[${this.name}] Executing: agent-browser ${args.join(' ')}`);

    try {
      const result = execFileSync('agent-browser', args, {
        encoding: 'utf-8',
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large snapshots
      });
      return result;
    } catch (error: any) {
      logger.error(`[${this.name}] agent-browser command failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if agent-browser is installed
   */
  private checkInstallation(): boolean {
    try {
      execFileSync('agent-browser', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async scrape(): Promise<RawEvent[]> {
    const metrics: ScraperMetrics = {
      fetchMethod: 'agent-browser',
      pageLoadTimeMs: 0,
      snapshotSizeBytes: 0,
      claudeInputTokens: 0,
      claudeOutputTokens: 0,
      totalTimeMs: 0,
      eventsExtracted: 0,
    };
    const startTime = Date.now();

    try {
      // Check if agent-browser is installed
      if (!this.checkInstallation()) {
        throw new Error(
          'agent-browser is not installed. Run: npm install -g agent-browser && agent-browser install'
        );
      }

      logger.info(`[${this.name}] Opening ${this.sourceUrl} with agent-browser`);

      // Open the page
      const pageLoadStart = Date.now();
      this.execAgentBrowser('open', this.sourceUrl);

      // Wait for specific element if configured
      if (this.waitForSelector) {
        logger.debug(`[${this.name}] Waiting for selector: ${this.waitForSelector}`);
        try {
          this.execAgentBrowser('find', 'text', this.waitForSelector);
        } catch {
          // Continue even if element not found
          logger.warn(`[${this.name}] Selector not found, continuing anyway`);
        }
      }

      metrics.pageLoadTimeMs = Date.now() - pageLoadStart;

      // Get accessibility tree snapshot (much smaller than full HTML!)
      const snapshotFlags: string[] = ['snapshot'];
      if (this.interactiveOnly) snapshotFlags.push('-i');
      if (this.compactSnapshot) snapshotFlags.push('-c');
      snapshotFlags.push('-d', String(this.maxDepth));

      const snapshot = this.execAgentBrowser(...snapshotFlags);
      metrics.snapshotSizeBytes = Buffer.byteLength(snapshot, 'utf-8');

      logger.info(
        `[${this.name}] Got accessibility snapshot: ${metrics.snapshotSizeBytes} bytes (vs typical HTML: ~100KB+)`
      );

      // Close the browser
      try {
        this.execAgentBrowser('close');
      } catch {
        // Ignore close errors
      }

      // Extract events using Claude with the compact snapshot
      const events = await this.extractEventsFromSnapshot(snapshot, metrics);
      metrics.eventsExtracted = events.length;
      metrics.totalTimeMs = Date.now() - startTime;

      this.lastMetrics = metrics;

      logger.info(
        `[${this.name}] Metrics: ${metrics.snapshotSizeBytes} bytes input, ` +
          `${metrics.claudeInputTokens} input tokens, ${events.length} events, ` +
          `${metrics.totalTimeMs}ms total`
      );

      return events;
    } catch (error: any) {
      metrics.totalTimeMs = Date.now() - startTime;
      this.lastMetrics = metrics;

      // Try to close browser on error
      try {
        this.execAgentBrowser('close');
      } catch {
        // Ignore
      }

      logger.error(`[${this.name}] Scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract events from accessibility tree snapshot using Claude
   * This uses significantly less tokens than full HTML
   */
  private async extractEventsFromSnapshot(
    snapshot: string,
    metrics: ScraperMetrics
  ): Promise<RawEvent[]> {
    try {
      const prompt = `You are an expert at extracting event information from webpage accessibility trees.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
SOURCE URL: ${this.sourceUrl}
VENUE: ${this.venueName}

This is an accessibility tree snapshot from a webpage. Elements are marked with refs like @e1, @e2, etc.
The format shows the element role, name/text, and any relevant attributes.

Extract ALL FUTURE/UPCOMING events from this snapshot (ignore past events). For each event, extract:
- title (event name - required)
- rawDate (date text as it appears - required)
- rawTime (time text as it appears - optional)
- rawDescription (description or details - optional, can be empty string)
- rawPrice (price text like "$20" or "Free" - optional, can be empty string)
- imageUrl (if any image URLs are present - optional, can be null)
- url (link URL if present - optional, can be null)
- elementRef (the @e# reference for the main event element - useful for future interaction)

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no explanations, no code blocks
2. Return ONLY events that actually exist in the snapshot - DO NOT make up events
3. If you see an events section but no actual events listed, return: []
4. All URLs must be actually present in the snapshot data
5. All dates must be explicitly shown - do not guess dates
6. Look for patterns like: event titles near dates, links to event pages, ticket buttons

If no events found, return: []

ACCESSIBILITY TREE SNAPSHOT:
${snapshot}`;

      const message = await callClaude(prompt, this.name);

      // Track token usage
      metrics.claudeInputTokens = message.usage.input_tokens;
      metrics.claudeOutputTokens = message.usage.output_tokens;

      const responseText = extractResponseText(message);
      const extractedEvents = parseClaudeResponse(responseText, this.name);

      const events = validateAndMapEvents(extractedEvents, {
        scraperName: this.name,
        venueName: this.venueName,
        extractionMethod: 'agent-browser',
      });

      logger.info(
        `[${this.name}] Extracted ${events.length} upcoming events from snapshot ` +
          `(${metrics.claudeInputTokens} input tokens)`
      );

      return events;
    } catch (error: any) {
      logger.error(`[${this.name}] Event extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Click an element by ref (for pagination or interaction)
   */
  async clickElement(ref: string): Promise<void> {
    this.execAgentBrowser('click', ref);
  }

  /**
   * Fill a form field by ref
   */
  async fillElement(ref: string, value: string): Promise<void> {
    this.execAgentBrowser('fill', ref, value);
  }

  /**
   * Get a fresh snapshot (useful after interactions)
   */
  async getSnapshot(): Promise<string> {
    const snapshotArgs: string[] = ['snapshot'];
    if (this.interactiveOnly) snapshotArgs.push('-i');
    if (this.compactSnapshot) snapshotArgs.push('-c');
    snapshotArgs.push('-d', String(this.maxDepth));

    return this.execAgentBrowser(...snapshotArgs);
  }

  /**
   * Scrape with pagination support
   * Will continue clicking "next" or "load more" until no more events
   */
  async scrapeWithPagination(
    nextButtonPattern: RegExp = /next|more|load more|show more/i,
    maxPages: number = 5
  ): Promise<RawEvent[]> {
    const allEvents: RawEvent[] = [];
    let page = 0;

    try {
      if (!this.checkInstallation()) {
        throw new Error('agent-browser is not installed');
      }

      logger.info(`[${this.name}] Opening ${this.sourceUrl} with pagination support`);
      this.execAgentBrowser('open', this.sourceUrl);

      while (page < maxPages) {
        page++;
        logger.info(`[${this.name}] Processing page ${page}/${maxPages}`);

        // Get snapshot and extract events
        const snapshot = await this.getSnapshot();
        const metrics: ScraperMetrics = {
          fetchMethod: 'agent-browser',
          pageLoadTimeMs: 0,
          snapshotSizeBytes: Buffer.byteLength(snapshot, 'utf-8'),
          claudeInputTokens: 0,
          claudeOutputTokens: 0,
          totalTimeMs: 0,
          eventsExtracted: 0,
        };

        const events = await this.extractEventsFromSnapshot(snapshot, metrics);
        allEvents.push(...events);

        // Look for next/more button in snapshot
        const nextMatch = snapshot.match(new RegExp(`(@e\\d+).*?${nextButtonPattern.source}`, 'i'));

        if (!nextMatch) {
          logger.info(`[${this.name}] No more pages found`);
          break;
        }

        const nextRef = nextMatch[1];
        logger.info(`[${this.name}] Clicking next button: ${nextRef}`);

        try {
          await this.clickElement(nextRef);
          // Wait for page to update
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch {
          logger.warn(`[${this.name}] Failed to click next button`);
          break;
        }
      }

      this.execAgentBrowser('close');

      // Deduplicate events
      const uniqueEvents = allEvents.filter(
        (event, index, self) =>
          index === self.findIndex((e) => e.title === event.title && e.rawDate === event.rawDate)
      );

      logger.info(
        `[${this.name}] Scraped ${uniqueEvents.length} unique events from ${page} pages`
      );

      return uniqueEvents;
    } catch (error: any) {
      try {
        this.execAgentBrowser('close');
      } catch {
        // Ignore
      }
      throw error;
    }
  }
}

/**
 * Factory function to create an AgentBrowserScraper instance
 */
export function createAgentBrowserScraper(
  name: string,
  sourceUrl: string,
  venueName: string,
  options?: {
    sessionId?: string;
    profilePath?: string;
    waitForSelector?: string;
    interactiveOnly?: boolean;
    compactSnapshot?: boolean;
    maxDepth?: number;
  }
): AgentBrowserScraper {
  return new AgentBrowserScraper(name, sourceUrl, venueName, options);
}
