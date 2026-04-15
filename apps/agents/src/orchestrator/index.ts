import dotenv from 'dotenv';
import path from 'path';
import { scheduleAllScrapers, scraperWorker } from './scheduler';
import { scraperMonitor, startMonitoring } from './monitor';
import { logger } from '../lib/scraper-utils';
import { disconnect } from '@slo-events/database';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    // Close scraper worker
    logger.info('Closing scraper worker...');
    await scraperWorker.close();

    // Disconnect from database
    logger.info('Disconnecting from database...');
    await disconnect();

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error: any) {
    logger.error(`Error during graceful shutdown: ${error.message}`, error);
    process.exit(1);
  }
}

// Register shutdown handlers
const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
signals.forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

/**
 * Main orchestrator entry point
 */
async function main() {
  try {
    logger.info('Starting SLO Events Scraper Orchestrator...');

    // Verify environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    // Schedule all scrapers
    await scheduleAllScrapers();

    // Start health monitoring
    startMonitoring();

    // Log system status
    const systemHealth = await scraperMonitor.getSystemHealth();
    logger.info('System health:', systemHealth);

    logger.info('Orchestrator started successfully');
    logger.info('Worker is processing jobs...');
    logger.info('Press Ctrl+C to stop gracefully');
  } catch (error: any) {
    logger.error(`Failed to start orchestrator: ${error.message}`, error);
    process.exit(1);
  }
}

// Start orchestrator
if (require.main === module) {
  main();
}

export { scheduleAllScrapers, scraperMonitor };
