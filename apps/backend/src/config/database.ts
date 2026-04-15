import { prisma, metrics, connectWithRetry } from '@slo-events/database';
import { logger } from '../lib/logger';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists at project root
const logsDir = path.join(process.cwd(), '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Integrate Prisma logging with Winston
prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma error', {
    target: e.target,
    timestamp: e.timestamp,
    message: e.message,
  });

  // Also log to dedicated Prisma error file
  const logEntry = `[${new Date().toISOString()}] ERROR: ${JSON.stringify(e, null, 2)}\n`;
  fs.appendFileSync(path.join(logsDir, 'prisma-errors.log'), logEntry);
});

prisma.$on('warn' as never, (e: any) => {
  logger.warn('Prisma warning', {
    target: e.target,
    timestamp: e.timestamp,
    message: e.message,
  });

  const logEntry = `[${new Date().toISOString()}] WARN: ${JSON.stringify(e, null, 2)}\n`;
  fs.appendFileSync(path.join(logsDir, 'prisma-warnings.log'), logEntry);
});

// Log queries in development if enabled
if (process.env.LOG_QUERIES === 'true') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug('Prisma query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
      target: e.target,
    });
  });
}

// Graceful shutdown handlers
const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, closing database connections gracefully...`);
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
    process.exit(0);
  });
});

process.on('beforeExit', async () => {
  logger.info('Process exiting, disconnecting from database...');
  await prisma.$disconnect();
});

// Connect to database with retry logic on startup
if (process.env.NODE_ENV !== 'test') {
  connectWithRetry()
    .then(() => {
      logger.info('Database connection established with retry logic');
    })
    .catch((error) => {
      logger.error('Failed to connect to database after retries:', error);
      process.exit(1);
    });
}

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  }
}

// Get database metrics
export function getDatabaseMetrics() {
  return metrics.getMetrics();
}

// Export prisma instance
export { prisma };
