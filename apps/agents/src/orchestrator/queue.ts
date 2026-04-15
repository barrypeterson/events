import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../lib/scraper-utils';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Redis connection configuration
 */
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * BullMQ queue for scraper jobs
 */
export const scraperQueue = new Queue('scrapers', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 jobs
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days
    },
  },
});

/**
 * Queue events for monitoring
 */
export const scraperQueueEvents = new QueueEvents('scrapers', {
  connection: redisConnection,
});

/**
 * Add scraper job to queue
 */
export async function addScraperJob(
  scraperName: string,
  options: {
    priority?: number;
    delay?: number;
    repeat?: {
      pattern: string; // Cron pattern
    };
  } = {}
) {
  try {
    const job = await scraperQueue.add(
      scraperName,
      { scraperName },
      {
        jobId: options.repeat ? `${scraperName}-scheduled` : undefined,
        priority: options.priority || 10,
        delay: options.delay,
        repeat: options.repeat,
      }
    );

    logger.info(`Added scraper job: ${scraperName} (${job.id})`);
    return job;
  } catch (error: any) {
    logger.error(`Failed to add scraper job ${scraperName}: ${error.message}`);
    throw error;
  }
}

/**
 * Remove scheduled scraper job
 */
export async function removeScraperJob(scraperName: string) {
  try {
    await scraperQueue.removeRepeatable(scraperName, {
      pattern: '', // Will be matched by job name
    });

    logger.info(`Removed scheduled scraper job: ${scraperName}`);
  } catch (error: any) {
    logger.error(`Failed to remove scraper job ${scraperName}: ${error.message}`);
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    scraperQueue.getWaitingCount(),
    scraperQueue.getActiveCount(),
    scraperQueue.getCompletedCount(),
    scraperQueue.getFailedCount(),
    scraperQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Get repeatable jobs (scheduled scrapers)
 */
export async function getScheduledJobs() {
  return scraperQueue.getRepeatableJobs();
}

/**
 * Pause queue
 */
export async function pauseQueue() {
  await scraperQueue.pause();
  logger.info('Scraper queue paused');
}

/**
 * Resume queue
 */
export async function resumeQueue() {
  await scraperQueue.resume();
  logger.info('Scraper queue resumed');
}

/**
 * Clear all jobs from queue
 */
export async function clearQueue() {
  await scraperQueue.drain();
  await scraperQueue.clean(0, 1000);
  logger.info('Scraper queue cleared');
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  await scraperQueue.close();
  await scraperQueueEvents.close();
  await redisConnection.quit();
  logger.info('Queue connections closed');
}

// Queue event listeners
scraperQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Job completed: ${jobId}`);
});

scraperQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Job failed: ${jobId} - ${failedReason}`);
});

scraperQueueEvents.on('progress', ({ jobId, data }) => {
  logger.debug(`Job progress: ${jobId} - ${JSON.stringify(data)}`);
});

// Handle process termination
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queue...');
  await closeQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing queue...');
  await closeQueue();
  process.exit(0);
});
