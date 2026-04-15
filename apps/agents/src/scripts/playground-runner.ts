#!/usr/bin/env npx tsx
/**
 * Playground Runner Script
 *
 * Runs a single scraper and outputs results as JSON.
 * Called by the backend API for the scraper playground.
 *
 * Usage:
 *   npx tsx playground-runner.ts --url <url> --venue <name> --scraper <type> --output <file>
 */

import * as fs from 'fs';
import { AgentBrowserScraper } from '../scrapers/agent-browser';
import { ClaudePlaywrightScraper } from '../scrapers/claude-playwright';
import { ClaudeUniversalScraper } from '../scrapers/claude-universal';

// Parse command line arguments
function parseArgs(): {
  url: string;
  venue: string;
  scraper: 'agent-browser' | 'playwright' | 'universal';
  output: string;
} {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    result[key] = value;
  }

  if (!result.url || !result.venue || !result.scraper || !result.output) {
    console.error('Missing required arguments');
    console.error(
      'Usage: npx tsx playground-runner.ts --url <url> --venue <name> --scraper <type> --output <file>'
    );
    process.exit(1);
  }

  return {
    url: result.url,
    venue: result.venue,
    scraper: result.scraper as 'agent-browser' | 'playwright' | 'universal',
    output: result.output,
  };
}

async function main() {
  const { url, venue, scraper: scraperType, output } = parseArgs();

  console.log(`Starting ${scraperType} scraper`);
  console.log(`URL: ${url}`);
  console.log(`Venue: ${venue}`);

  const startTime = Date.now();
  let events: any[] = [];
  let metrics: any = { fetchMethod: scraperType };

  try {
    if (scraperType === 'agent-browser') {
      console.log('Initializing AgentBrowserScraper...');
      const scraper = new AgentBrowserScraper(`playground-${scraperType}`, url, venue);
      events = await scraper.scrape();
      metrics = scraper.lastMetrics || { fetchMethod: 'agent-browser' };
    } else if (scraperType === 'playwright') {
      console.log('Initializing ClaudePlaywrightScraper...');
      const scraper = new ClaudePlaywrightScraper(`playground-${scraperType}`, url, venue);
      events = await scraper.scrape();
      metrics = { fetchMethod: 'playwright' };
    } else {
      console.log('Initializing ClaudeUniversalScraper...');
      const scraper = new ClaudeUniversalScraper(`playground-${scraperType}`, url, venue);
      events = await scraper.scrape();
      metrics = { fetchMethod: 'fetch' };
    }

    const duration = Date.now() - startTime;
    metrics.totalTimeMs = duration;

    console.log(`Scraper completed in ${duration}ms`);
    console.log(`Found ${events.length} events`);

    // Write results to output file
    const results = {
      success: true,
      events,
      metrics,
      scraperType,
      url,
      venue,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(output, JSON.stringify(results, null, 2));
    console.log(`Results written to ${output}`);

    process.exit(0);
  } catch (error: any) {
    console.error(`Scraper failed: ${error.message}`);

    // Write error to output file
    const results = {
      success: false,
      events: [],
      metrics: { fetchMethod: scraperType, totalTimeMs: Date.now() - startTime },
      error: error.message,
      scraperType,
      url,
      venue,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(output, JSON.stringify(results, null, 2));
    process.exit(1);
  }
}

main();
