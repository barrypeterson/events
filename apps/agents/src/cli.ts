#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { getScraper, getAllScrapers, runScraperNow, runAllScrapersNow } from './orchestrator/scheduler';
import { scraperMonitor } from './orchestrator/monitor';
import { getQueueStats, clearQueue } from './orchestrator/queue';
import { logger } from './lib/scraper-utils';
import { disconnect } from '@slo-events/database';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, cleaning up...`);
  try {
    await disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
signals.forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

/**
 * CLI for manual scraper execution and monitoring
 */
class ScraperCLI {
  private command: string;
  private args: string[];

  constructor() {
    this.command = process.argv[2] || 'help';
    this.args = process.argv.slice(3);
  }

  async run() {
    try {
      switch (this.command) {
        case 'run':
          await this.runScraper();
          break;
        case 'run-all':
          await this.runAllScrapers();
          break;
        case 'test':
          await this.testScraper();
          break;
        case 'list':
          await this.listScrapers();
          break;
        case 'status':
          await this.showStatus();
          break;
        case 'health':
          await this.showHealth();
          break;
        case 'report':
          await this.showReport();
          break;
        case 'queue':
          await this.showQueue();
          break;
        case 'clear-queue':
          await this.clearQueue();
          break;
        case 'help':
        default:
          this.showHelp();
          break;
      }

      // Cleanup before exit
      await disconnect();
      process.exit(0);
    } catch (error: any) {
      logger.error(`CLI error: ${error.message}`);
      console.error(`Error: ${error.message}`);

      // Cleanup on error
      try {
        await disconnect();
      } catch (cleanupError) {
        logger.error('Error during cleanup:', cleanupError);
      }

      process.exit(1);
    }
  }

  /**
   * Run a specific scraper
   */
  async runScraper() {
    const scraperName = this.args[0];

    if (!scraperName) {
      console.error('Error: Scraper name is required');
      console.log('Usage: agents run <scraper-name>');
      console.log('Example: agents run fremont-theater');
      process.exit(1);
    }

    const scraper = getScraper(scraperName);

    if (!scraper) {
      console.error(`Error: Unknown scraper: ${scraperName}`);
      console.log('Use "agents list" to see available scrapers');
      process.exit(1);
    }

    console.log(`Running scraper: ${scraperName}...`);
    console.log(`Source: ${scraper.sourceUrl}`);
    console.log('');

    const startTime = Date.now();
    const stats = await scraper.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('Results:');
    console.log(`  Events found: ${stats.eventsFound}`);
    console.log(`  New events: ${stats.eventsNew}`);
    console.log(`  Updated events: ${stats.eventsUpdated}`);
    console.log(`  Duplicates: ${stats.eventsDuplicate}`);
    console.log(`  Flagged for review: ${stats.eventsFlagged}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Duration: ${duration}s`);
    console.log('');
    console.log('✓ Scraper completed successfully');
  }

  /**
   * Run all scrapers
   */
  async runAllScrapers() {
    const scrapers = getAllScrapers();

    console.log(`Running ${scrapers.length} scrapers...`);
    console.log('');

    const results = [];

    for (const { name, scraper } of scrapers) {
      try {
        console.log(`[${name}] Starting...`);
        const startTime = Date.now();
        const stats = await scraper.run();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        results.push({
          name,
          success: true,
          stats,
          duration,
        });

        console.log(`[${name}] ✓ Completed: ${stats.eventsNew} new, ${stats.errors} errors (${duration}s)`);
      } catch (error: any) {
        results.push({
          name,
          success: false,
          error: error.message,
        });

        console.log(`[${name}] ✗ Failed: ${error.message}`);
      }

      console.log('');
    }

    // Summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalEvents = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.stats!.eventsNew, 0);

    console.log('Summary:');
    console.log(`  Successful: ${successful}/${scrapers.length}`);
    console.log(`  Failed: ${failed}/${scrapers.length}`);
    console.log(`  Total new events: ${totalEvents}`);
    console.log('');
    console.log('✓ All scrapers completed');
  }

  /**
   * Test a scraper (scrape only, no database operations)
   */
  async testScraper() {
    const scraperName = this.args[0];

    if (!scraperName) {
      console.error('Error: Scraper name is required');
      console.log('Usage: agents test <scraper-name>');
      process.exit(1);
    }

    const scraper = getScraper(scraperName);

    if (!scraper) {
      console.error(`Error: Unknown scraper: ${scraperName}`);
      process.exit(1);
    }

    console.log(`Testing scraper: ${scraperName}...`);
    console.log(`Source: ${scraper.sourceUrl}`);
    console.log('');

    const startTime = Date.now();
    const rawEvents = await scraper.scrape();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`Found ${rawEvents.length} raw events (${duration}s)`);
    console.log('');

    if (rawEvents.length > 0) {
      console.log('Sample events:');
      rawEvents.slice(0, 3).forEach((event, idx) => {
        console.log(`\n${idx + 1}. ${event.title}`);
        console.log(`   Date: ${event.rawDate || 'N/A'}`);
        console.log(`   Time: ${event.rawTime || 'N/A'}`);
        console.log(`   Venue: ${event.rawVenue || 'N/A'}`);
        console.log(`   Price: ${event.rawPrice || 'N/A'}`);
      });

      if (rawEvents.length > 3) {
        console.log(`\n... and ${rawEvents.length - 3} more events`);
      }
    }

    console.log('');
    console.log('✓ Test completed successfully');
  }

  /**
   * List all available scrapers
   */
  async listScrapers() {
    const scrapers = getAllScrapers();

    console.log(`Available scrapers (${scrapers.length}):\n`);

    for (const { name, scraper } of scrapers) {
      console.log(`  ${name}`);
      console.log(`    URL: ${scraper.sourceUrl}`);
      console.log(`    Schedule: ${scraper.schedule}`);
      console.log('');
    }
  }

  /**
   * Show system status
   */
  async showStatus() {
    console.log('System Status\n');

    const health = await scraperMonitor.getSystemHealth();

    console.log(`Overall Health: ${health.status.toUpperCase()}`);
    console.log('');
    console.log('Scrapers:');
    console.log(`  Total: ${health.scrapers.total}`);
    console.log(`  Healthy: ${health.scrapers.healthy}`);
    console.log(`  Unhealthy: ${health.scrapers.unhealthy}`);
    console.log('');
    console.log('Queue:');
    console.log(`  Active: ${health.queue.active}`);
    console.log(`  Waiting: ${health.queue.waiting}`);
    console.log(`  Completed: ${health.queue.completed}`);
    console.log(`  Failed: ${health.queue.failed}`);
    console.log('');
    console.log(`Scheduled Jobs: ${health.scheduledJobs}`);
  }

  /**
   * Show health status for all scrapers
   */
  async showHealth() {
    console.log('Scraper Health Status\n');

    const healthStatus = await scraperMonitor.getHealthStatus();

    for (const scraper of healthStatus) {
      const status = scraper.isHealthy ? '✓' : '✗';
      const statusText = scraper.isHealthy ? 'Healthy' : 'Unhealthy';

      console.log(`${status} ${scraper.name}`);
      console.log(`  Status: ${statusText}`);
      console.log(`  Success Rate: ${scraper.successRate}%`);
      console.log(`  Total Runs: ${scraper.totalRuns}`);
      console.log(`  Consecutive Failures: ${scraper.consecutiveFailures}`);
      console.log(`  Avg Events/Run: ${scraper.avgEventsPerRun}`);

      if (scraper.lastRun) {
        console.log(`  Last Run: ${scraper.lastRun.startedAt.toLocaleString()}`);
        console.log(`    Status: ${scraper.lastRun.status}`);
        console.log(`    Events: ${scraper.lastRun.eventsNew} new`);

        if (scraper.lastRun.errorMessage) {
          console.log(`    Error: ${scraper.lastRun.errorMessage.substring(0, 100)}`);
        }
      }

      console.log('');
    }
  }

  /**
   * Show detailed report for a scraper
   */
  async showReport() {
    const scraperName = this.args[0];
    const days = parseInt(this.args[1] || '7');

    if (!scraperName) {
      console.error('Error: Scraper name is required');
      console.log('Usage: agents report <scraper-name> [days]');
      process.exit(1);
    }

    console.log(`Scraper Report: ${scraperName} (last ${days} days)\n`);

    const report = await scraperMonitor.getScraperReport(scraperName, days);

    console.log('Summary:');
    console.log(`  Total Runs: ${report.summary.totalRuns}`);
    console.log(`  Total Events: ${report.summary.totalEvents}`);
    console.log(`  Total Errors: ${report.summary.totalErrors}`);
    console.log(`  Avg Events/Run: ${report.summary.avgEventsPerRun.toFixed(1)}`);
    console.log('');

    if (report.runs.length > 0) {
      console.log('Recent Runs:');

      report.runs.slice(0, 10).forEach((run) => {
        const status = run.status === 'SUCCESS' ? '✓' : run.status === 'FAILED' ? '✗' : '○';
        const duration = run.duration ? `${(run.duration / 1000).toFixed(1)}s` : 'N/A';

        console.log(`  ${status} ${run.startedAt.toLocaleString()}`);
        console.log(`    Status: ${run.status}`);
        console.log(`    Events: ${run.eventsNew} new, ${run.eventsUpdated} updated`);
        console.log(`    Duration: ${duration}`);

        if (run.errorMessage) {
          console.log(`    Error: ${run.errorMessage.substring(0, 100)}`);
        }

        console.log('');
      });
    }
  }

  /**
   * Show queue statistics
   */
  async showQueue() {
    console.log('Queue Statistics\n');

    const stats = await getQueueStats();

    console.log(`Active: ${stats.active}`);
    console.log(`Waiting: ${stats.waiting}`);
    console.log(`Completed: ${stats.completed}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Delayed: ${stats.delayed}`);
    console.log(`Total: ${stats.total}`);
  }

  /**
   * Clear queue
   */
  async clearQueue() {
    console.log('Clearing queue...');
    await clearQueue();
    console.log('✓ Queue cleared');
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(`
SLO Events Scraper CLI

Usage: agents <command> [options]

Commands:
  run <scraper>          Run a specific scraper
  run-all                Run all scrapers
  test <scraper>         Test scraper (scrape only, no DB writes)
  list                   List all available scrapers
  status                 Show system status
  health                 Show health status for all scrapers
  report <scraper> [days] Show detailed report for a scraper
  queue                  Show queue statistics
  clear-queue            Clear all jobs from queue
  help                   Show this help message

Examples:
  agents run fremont-theater
  agents run-all
  agents test slo-brew
  agents report fremont-theater 30
  agents health

Available Scrapers:
  fremont-theater        Fremont Theater
  slo-brew               SLO Brew Rock
  pac-slo                PAC SLO
  cal-poly               Cal Poly Events
  downtown-slo           Downtown SLO
    `);
  }
}

// Run CLI
const cli = new ScraperCLI();
cli.run();
