/**
 * Compare scraper approaches: AgentBrowser vs ClaudePlaywright vs ClaudeUniversal
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/compare-scrapers.ts <url> <venue-name>
 *
 * Example:
 *   npx tsx apps/agents/src/scripts/compare-scrapers.ts "https://www.fremonttheater.com/events" "Fremont Theater"
 */

import { AgentBrowserScraper, ScraperMetrics } from '../scrapers/agent-browser';
import { ClaudePlaywrightScraper } from '../scrapers/claude-playwright';
import { ClaudeUniversalScraper } from '../scrapers/claude-universal';
import { RawEvent } from '../types';
import { logger } from '../lib/scraper-utils';

interface ComparisonResult {
  scraper: string;
  success: boolean;
  eventsFound: number;
  events: RawEvent[];
  metrics: {
    totalTimeMs: number;
    inputSizeBytes?: number;
    claudeInputTokens?: number;
    claudeOutputTokens?: number;
  };
  error?: string;
}

async function runScraper(
  name: string,
  scraperFn: () => Promise<{ events: RawEvent[]; metrics?: Partial<ScraperMetrics> }>
): Promise<ComparisonResult> {
  const startTime = Date.now();

  try {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`Running: ${name}`);
    logger.info('='.repeat(60));

    const { events, metrics } = await scraperFn();

    return {
      scraper: name,
      success: true,
      eventsFound: events.length,
      events,
      metrics: {
        totalTimeMs: Date.now() - startTime,
        inputSizeBytes: metrics?.snapshotSizeBytes,
        claudeInputTokens: metrics?.claudeInputTokens,
        claudeOutputTokens: metrics?.claudeOutputTokens,
      },
    };
  } catch (error: any) {
    return {
      scraper: name,
      success: false,
      eventsFound: 0,
      events: [],
      metrics: {
        totalTimeMs: Date.now() - startTime,
      },
      error: error.message,
    };
  }
}

function printEventComparison(results: ComparisonResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('EVENT COMPARISON');
  console.log('='.repeat(80));

  // Get all unique event titles across all scrapers
  const allTitles = new Set<string>();
  results.forEach((r) => r.events.forEach((e) => allTitles.add(e.title)));

  console.log(`\nUnique event titles found: ${allTitles.size}\n`);

  // Create a comparison matrix
  const matrix: Record<string, Record<string, boolean>> = {};
  allTitles.forEach((title) => {
    matrix[title] = {};
    results.forEach((r) => {
      matrix[title][r.scraper] = r.events.some((e) => e.title === title);
    });
  });

  // Print matrix
  const scraperNames = results.map((r) => r.scraper);
  const maxTitleLen = Math.min(50, Math.max(...Array.from(allTitles).map((t) => t.length)));

  // Header
  console.log(
    'Event Title'.padEnd(maxTitleLen + 2) +
      scraperNames.map((n) => n.substring(0, 15).padEnd(16)).join('')
  );
  console.log('-'.repeat(maxTitleLen + 2 + scraperNames.length * 16));

  // Rows
  Array.from(allTitles)
    .sort()
    .forEach((title) => {
      const truncatedTitle =
        title.length > maxTitleLen ? title.substring(0, maxTitleLen - 3) + '...' : title;
      const row =
        truncatedTitle.padEnd(maxTitleLen + 2) +
        scraperNames.map((n) => (matrix[title][n] ? '✓'.padEnd(16) : '✗'.padEnd(16))).join('');
      console.log(row);
    });

  // Agreement analysis
  console.log('\n' + '-'.repeat(80));
  const allAgree = Array.from(allTitles).filter((title) =>
    scraperNames.every((n) => matrix[title][n])
  );
  const someAgree = Array.from(allTitles).filter((title) => {
    const found = scraperNames.filter((n) => matrix[title][n]).length;
    return found > 0 && found < scraperNames.length;
  });

  console.log(`Events found by ALL scrapers: ${allAgree.length}`);
  console.log(`Events found by SOME scrapers: ${someAgree.length}`);

  if (someAgree.length > 0) {
    console.log('\nPartially detected events:');
    someAgree.forEach((title) => {
      const foundBy = scraperNames.filter((n) => matrix[title][n]);
      console.log(`  - "${title.substring(0, 60)}" (found by: ${foundBy.join(', ')})`);
    });
  }
}

function printMetricsComparison(results: ComparisonResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE METRICS');
  console.log('='.repeat(80) + '\n');

  const headers = ['Metric', ...results.map((r) => r.scraper)];
  const colWidth = 20;

  // Print header
  console.log(headers.map((h) => h.substring(0, colWidth - 1).padEnd(colWidth)).join(''));
  console.log('-'.repeat(colWidth * headers.length));

  // Metrics rows
  const metrics = [
    {
      name: 'Status',
      values: results.map((r) => (r.success ? '✓ Success' : '✗ Failed')),
    },
    {
      name: 'Events Found',
      values: results.map((r) => r.eventsFound.toString()),
    },
    {
      name: 'Total Time',
      values: results.map((r) => `${(r.metrics.totalTimeMs / 1000).toFixed(1)}s`),
    },
    {
      name: 'Input Size',
      values: results.map((r) =>
        r.metrics.inputSizeBytes
          ? `${(r.metrics.inputSizeBytes / 1024).toFixed(1)} KB`
          : 'N/A'
      ),
    },
    {
      name: 'Claude Input Tokens',
      values: results.map((r) =>
        r.metrics.claudeInputTokens ? r.metrics.claudeInputTokens.toLocaleString() : 'N/A'
      ),
    },
    {
      name: 'Claude Output Tokens',
      values: results.map((r) =>
        r.metrics.claudeOutputTokens ? r.metrics.claudeOutputTokens.toLocaleString() : 'N/A'
      ),
    },
  ];

  metrics.forEach((m) => {
    console.log(
      [m.name, ...m.values].map((v) => v.substring(0, colWidth - 1).padEnd(colWidth)).join('')
    );
  });

  // Token savings calculation
  const agentBrowserResult = results.find((r) => r.scraper.includes('AgentBrowser'));
  const playwrightResult = results.find((r) => r.scraper.includes('Playwright'));
  const universalResult = results.find((r) => r.scraper.includes('Universal'));

  if (agentBrowserResult?.metrics.claudeInputTokens) {
    console.log('\n' + '-'.repeat(80));
    console.log('TOKEN SAVINGS ANALYSIS:');

    if (playwrightResult?.metrics.claudeInputTokens) {
      const savings =
        ((playwrightResult.metrics.claudeInputTokens - agentBrowserResult.metrics.claudeInputTokens) /
          playwrightResult.metrics.claudeInputTokens) *
        100;
      console.log(
        `  vs Playwright: ${savings.toFixed(1)}% fewer tokens ` +
          `(${agentBrowserResult.metrics.claudeInputTokens.toLocaleString()} vs ${playwrightResult.metrics.claudeInputTokens.toLocaleString()})`
      );
    }

    if (universalResult?.metrics.claudeInputTokens) {
      const savings =
        ((universalResult.metrics.claudeInputTokens - agentBrowserResult.metrics.claudeInputTokens) /
          universalResult.metrics.claudeInputTokens) *
        100;
      console.log(
        `  vs Universal: ${savings.toFixed(1)}% fewer tokens ` +
          `(${agentBrowserResult.metrics.claudeInputTokens.toLocaleString()} vs ${universalResult.metrics.claudeInputTokens.toLocaleString()})`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx apps/agents/src/scripts/compare-scrapers.ts <url> <venue-name>');
    console.log(
      '\nExample: npx tsx apps/agents/src/scripts/compare-scrapers.ts "https://www.fremonttheater.com/events" "Fremont Theater"'
    );
    process.exit(1);
  }

  const [url, venueName] = args;
  const scraperName = `compare-${venueName.toLowerCase().replace(/\s+/g, '-')}`;

  console.log('='.repeat(80));
  console.log('SCRAPER COMPARISON TEST');
  console.log('='.repeat(80));
  console.log(`URL: ${url}`);
  console.log(`Venue: ${venueName}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  const results: ComparisonResult[] = [];

  // Test 1: AgentBrowser Scraper
  const agentBrowserScraper = new AgentBrowserScraper(
    `${scraperName}-agent-browser`,
    url,
    venueName
  );

  results.push(
    await runScraper('AgentBrowser', async () => {
      const events = await agentBrowserScraper.scrape();
      return { events, metrics: agentBrowserScraper.lastMetrics };
    })
  );

  // Test 2: Claude Playwright Scraper
  const playwrightScraper = new ClaudePlaywrightScraper(
    `${scraperName}-playwright`,
    url,
    venueName
  );

  results.push(
    await runScraper('ClaudePlaywright', async () => {
      const events = await playwrightScraper.scrape();
      // Playwright scraper doesn't track tokens, estimate from HTML size
      return { events };
    })
  );

  // Test 3: Claude Universal Scraper (fetch only - won't work for JS-heavy sites)
  const universalScraper = new ClaudeUniversalScraper(`${scraperName}-universal`, url, venueName);

  results.push(
    await runScraper('ClaudeUniversal', async () => {
      const events = await universalScraper.scrape();
      return { events };
    })
  );

  // Print comparison reports
  printMetricsComparison(results);
  printEventComparison(results);

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length === 0) {
    console.log('All scrapers failed!');
  } else {
    const bestByEvents = successfulResults.reduce((a, b) =>
      a.eventsFound > b.eventsFound ? a : b
    );
    const bestByTime = successfulResults.reduce((a, b) =>
      a.metrics.totalTimeMs < b.metrics.totalTimeMs ? a : b
    );
    const bestByTokens = successfulResults
      .filter((r) => r.metrics.claudeInputTokens)
      .reduce(
        (a, b) => ((a?.metrics.claudeInputTokens ?? Infinity) < (b.metrics.claudeInputTokens ?? Infinity) ? a : b),
        null as ComparisonResult | null
      );

    console.log(`Most events found: ${bestByEvents.scraper} (${bestByEvents.eventsFound} events)`);
    console.log(
      `Fastest: ${bestByTime.scraper} (${(bestByTime.metrics.totalTimeMs / 1000).toFixed(1)}s)`
    );
    if (bestByTokens) {
      console.log(
        `Most efficient (tokens): ${bestByTokens.scraper} (${bestByTokens.metrics.claudeInputTokens?.toLocaleString()} tokens)`
      );
    }
  }

  console.log('\n');
}

main().catch(console.error);
