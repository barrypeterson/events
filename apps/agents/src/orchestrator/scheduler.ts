import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { addScraperJob, scraperQueue } from './queue';
import { ScraperAgent } from '../types';
import { logger } from '../lib/scraper-utils';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Import Claude scrapers
import { ClaudeUniversalScraper } from '../scrapers/claude-universal';
import { ClaudePlaywrightScraper } from '../scrapers/claude-playwright';
import { SirenCustomScraper } from '../scrapers/siren-custom';
import { InstagramVisionScraper } from '../scrapers/instagram-vision';
import { CalPolyAthleticsScraper } from '../scrapers/cal-poly-athletics';
import { ImageCalendarScraper } from '../scrapers/image-calendar';

/**
 * Redis connection for worker
 */
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Registry of all available scrapers
 * Using Claude Universal Scraper for intelligent extraction from any website
 */
const scraperRegistry = new Map<string, ScraperAgent>([
  // Major Venues - Concert Halls & Theaters
  ['fremont-theater', new ClaudeUniversalScraper('fremont-theater', 'https://www.fremontslo.com/shows', 'Fremont Theater')],
  ['slo-brew', new ClaudeUniversalScraper('slo-brew', 'https://slobrew.com/events/', 'SLO Brew Rock')],
  ['pac-slo', new ClaudeUniversalScraper('pac-slo', 'https://www.pacslo.org/events', 'Performing Arts Center SLO')],
  ['cal-poly-arts', new ClaudeUniversalScraper('cal-poly-arts', 'https://www.pacslo.org/calpolyarts', 'Cal Poly Arts')],
  ['madonna-inn', new ClaudeUniversalScraper('madonna-inn', 'https://www.madonnainn.com/calendar', 'Madonna Inn')],
  ['vina-robles', new ClaudeUniversalScraper('vina-robles', 'https://vinaroblesamphitheatre.com/concerts', 'Vina Robles Amphitheatre')],
  ['santa-barbara-bowl', new ClaudeUniversalScraper('santa-barbara-bowl', 'https://sbbowl.com/concerts/', 'Santa Barbara Bowl')],

  // Bars & Pubs with Live Music
  // ['frog-and-peach', new ClaudeUniversalScraper('frog-and-peach', 'https://frogandpeachpub.wordpress.com/music-schedule/', 'Frog & Peach Pub')], // Disabled - website has old events from years ago
  ['the-mark', new ClaudeUniversalScraper('the-mark', 'https://www.themarkslo.com/music', 'The Mark SLO')],
  ['black-sheep', new ClaudeUniversalScraper('black-sheep', 'https://www.blacksheepslo.com/', 'Black Sheep Bar & Grill')],
  ['the-siren-morro-bay', new SirenCustomScraper()], // Custom scraper with specific selectors
  ['club-car-bar', new ClaudeUniversalScraper('club-car-bar', 'https://www.templetonmercantile.com/events', 'Club Car Bar')],
  ['mulligans-bar-grill', new ImageCalendarScraper(
    'mulligans-bar-grill',
    'https://www.avilabeachresort.com/',
    "Mulligan's Bar & Grill",
    'https://www.avilabeachresort.com/wp-content/uploads/sites/8747/{year}/{monthNum}/{month}_music_{year}.png'
  )],

  // Breweries & Taprooms
  ['libertine-brewing', new ClaudeUniversalScraper('libertine-brewing', 'https://libertinebrewing.com/publiceventsatlibertine', 'Libertine Brewing Company')],
  ['bang-the-drum', new ClaudeUniversalScraper('bang-the-drum', 'https://www.bangthedrumbrewery.com/our-events/', 'Bang the Drum Brewery')],
  ['humdinger-slo', new ClaudeUniversalScraper('humdinger-slo', 'https://humdingerbrewing.com/san-luis-obispo-location', 'Humdinger Brewing SLO')],
  ['shindig-cider', new ClaudeUniversalScraper('shindig-cider', 'https://www.shindigcider.com/events', 'Shindig Cider House')],
  ['central-coast-brewing', new ClaudeUniversalScraper('central-coast-brewing', 'https://www.centralcoastbrewing.com/', 'Central Coast Brewing')],
  ['tap-it-brewing', new ClaudeUniversalScraper('tap-it-brewing', 'https://www.tapitbrewing.com/', 'Tap It Brewing')],
  // ['7-sisters-brewing', new ClaudeUniversalScraper('7-sisters-brewing', 'https://www.7sistersbrewing.com/', '7 Sisters Brewing')],
  ['barrelhouse-paso', new ClaudeUniversalScraper('barrelhouse-paso', 'https://barrelhousebrewing.com/events-pasorobles', 'BarrelHouse Brewing Paso Robles')],

  // Community & Event Aggregators
  ['downtown-slo', new ClaudeUniversalScraper('downtown-slo', 'https://downtownslo.com/events/calendar', 'Downtown SLO')],
  ['big-big-slo', new ClaudeUniversalScraper('big-big-slo', 'https://www.bigbigslo.com/webcalendar', 'Big Big SLO Music Calendar')],
  ['visit-slo', new ClaudeUniversalScraper('visit-slo', 'https://visitslo.com/events/', 'Visit SLO Events')],
  ['highway-1-roadtrip', new ClaudeUniversalScraper('highway-1-roadtrip', 'https://highway1roadtrip.com/events/', 'Area Events')],

  // Sports
  ['cal-poly-athletics', new CalPolyAthleticsScraper()],

  // Kid-Friendly & Family Events
  ['slo-childrens-museum', new ClaudeUniversalScraper('slo-childrens-museum', 'https://www.slocm.org/programs', 'SLO Children\'s Museum')],
  ['slo-county-library', new ClaudeUniversalScraper('slo-county-library', 'https://www.slolibrary.org/index.php/kids', 'SLO County Library')],
  ['slo-city-parks-recreation', new ClaudeUniversalScraper('slo-city-parks-recreation', 'https://www.slocity.org/living/calendars/community-activities', 'SLO City Parks & Recreation')],
  ['slo-county-parks', new ClaudeUniversalScraper('slo-county-parks', 'https://slocountyparks.com/special-events/', 'SLO County Parks')],
  ['first-5-slo', new ClaudeUniversalScraper('first-5-slo', 'https://www.first5slo.org/community-happenings.php', 'First 5 SLO County')],
  ['sanluisobispomom', new ClaudeUniversalScraper('sanluisobispomom', 'https://www.sanluisobispomom.com/family-friendly-events.php', 'SanLuisObispoMom.com')],
  ['slo-botanical-garden', new ClaudeUniversalScraper('slo-botanical-garden', 'https://www.slobg.org/events', 'SLO Botanical Garden')],

  // Instagram Scrapers (using Claude Vision to extract from images)
  // Add Instagram handles for venues that primarily post events on Instagram
  // Examples (commented out - add actual Instagram handles):
  // ['instagram-7sisters', new InstagramVisionScraper('instagram-7sisters', '7sistersbrewing', '7 Sisters Brewing', 10)],
  // ['instagram-tapit', new InstagramVisionScraper('instagram-tapit', 'tapitbrewing', 'Tap It Brewing', 10)],
  // ['instagram-centralcoast', new InstagramVisionScraper('instagram-centralcoast', 'centralcoastbrewing', 'Central Coast Brewing', 10)],

]);

/**
 * BullMQ worker to process scraper jobs
 */
export const scraperWorker = new Worker(
  'scrapers',
  async (job: Job) => {
    // Handle "run-all" trigger from the backend API
    if (job.name === 'run-all' || !job.data.scraperName) {
      logger.info(`Processing run-all trigger (job ${job.id})`);
      await runAllScrapersNow();
      return { success: true, type: 'run-all' };
    }

    const { scraperName } = job.data;

    logger.info(`Processing job ${job.id}: ${scraperName}`);

    const scraper = scraperRegistry.get(scraperName);

    if (!scraper) {
      throw new Error(`Unknown scraper: ${scraperName}`);
    }

    try {
      // Run scraper
      const stats = await scraper.run();

      // Update job progress
      await job.updateProgress(100);

      logger.info(
        `Job ${job.id} completed: ${scraperName} - ${stats.eventsNew} new, ${stats.eventsUpdated} updated, ${stats.errors} errors`
      );

      return {
        scraperName,
        stats,
        success: true,
      };
    } catch (error: any) {
      logger.error(`Job ${job.id} failed: ${scraperName} - ${error.message}`);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.SCRAPER_CONCURRENCY || '2'), // Max 2 concurrent scrapers
    limiter: {
      max: 5, // Max 5 jobs per time window
      duration: 60000, // 1 minute
    },
  }
);

/**
 * Scrapers to skip. Add a venue name here to pause it.
 * Checked by scheduleAllScrapers and runAllScrapersNow.
 */
const DISABLED_SCRAPERS = new Set<string>(
  (process.env.DISABLED_SCRAPERS || '').split(',').map(s => s.trim()).filter(Boolean)
);

/**
 * Schedule all scrapers with their cron patterns
 */
export async function scheduleAllScrapers() {
  logger.info('Scheduling all scrapers...');

  for (const [name, scraper] of scraperRegistry.entries()) {
    if (DISABLED_SCRAPERS.has(name)) {
      logger.info(`Skipping disabled scraper: ${name}`);
      continue;
    }
    try {
      await addScraperJob(name, {
        repeat: {
          pattern: scraper.schedule,
        },
      });

      logger.info(`Scheduled ${name} with pattern: ${scraper.schedule}`);
    } catch (error: any) {
      logger.error(`Failed to schedule ${name}: ${error.message}`);
    }
  }

  logger.info('All scrapers scheduled');
}

/**
 * Schedule a specific scraper
 */
export async function scheduleScraper(scraperName: string) {
  const scraper = scraperRegistry.get(scraperName);

  if (!scraper) {
    throw new Error(`Unknown scraper: ${scraperName}`);
  }

  await addScraperJob(scraperName, {
    repeat: {
      pattern: scraper.schedule,
    },
  });

  logger.info(`Scheduled ${scraperName} with pattern: ${scraper.schedule}`);
}

/**
 * Run a scraper immediately (one-time)
 */
export async function runScraperNow(scraperName: string) {
  const scraper = scraperRegistry.get(scraperName);

  if (!scraper) {
    throw new Error(`Unknown scraper: ${scraperName}`);
  }

  await addScraperJob(scraperName, {
    priority: 1, // High priority for manual runs
  });

  logger.info(`Queued ${scraperName} for immediate execution`);
}

/**
 * Run all scrapers immediately
 */
export async function runAllScrapersNow() {
  logger.info('Queuing all scrapers for immediate execution...');

  for (const [name] of scraperRegistry.entries()) {
    if (DISABLED_SCRAPERS.has(name)) {
      logger.info(`Skipping disabled scraper: ${name}`);
      continue;
    }
    try {
      await runScraperNow(name);
    } catch (error: any) {
      logger.error(`Failed to queue ${name}: ${error.message}`);
    }
  }

  logger.info('All scrapers queued');
}

/**
 * Get scraper by name
 */
export function getScraper(name: string): ScraperAgent | undefined {
  return scraperRegistry.get(name);
}

/**
 * Get all scrapers
 */
export function getAllScrapers(): Array<{ name: string; scraper: ScraperAgent }> {
  return Array.from(scraperRegistry.entries()).map(([name, scraper]) => ({
    name,
    scraper,
  }));
}

/**
 * Get scraper names
 */
export function getScraperNames(): string[] {
  return Array.from(scraperRegistry.keys());
}

// Worker event listeners
scraperWorker.on('completed', (job) => {
  logger.info(`Worker completed job: ${job.id}`);
});

scraperWorker.on('failed', (job, error) => {
  logger.error(`Worker failed job: ${job?.id} - ${error.message}`);
});

scraperWorker.on('error', (error) => {
  logger.error(`Worker error: ${error.message}`);
});

// Graceful shutdown
export async function closeWorker() {
  await scraperWorker.close();
  await redisConnection.quit();
  logger.info('Worker closed');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await closeWorker();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker...');
  await closeWorker();
  process.exit(0);
});
