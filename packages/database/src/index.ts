import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getPrismaConfig } from './config';
import { metrics } from './metrics';
import { createExtendedPrismaClient } from './extensions';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Prisma client singleton
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const config = getPrismaConfig();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.log,
    errorFormat: config.errorFormat,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Query performance monitoring using event handlers
const SLOW_QUERY_THRESHOLD = 1000; // 1 second

// Track query performance
prisma.$on('query' as never, (e: any) => {
  const duration = e.duration;
  metrics.incrementQuery(duration);

  // Log slow queries
  if (duration > SLOW_QUERY_THRESHOLD) {
    metrics.incrementSlowQuery();

    const logEntry = {
      timestamp: new Date().toISOString(),
      query: e.query,
      params: e.params,
      duration: `${duration}ms`,
      target: e.target,
    };

    fs.appendFileSync(
      path.join(logsDir, 'prisma-slow-queries.log'),
      JSON.stringify(logEntry) + '\n'
    );
  }

  // Log all queries if enabled
  if (process.env.LOG_QUERIES === 'true') {
    const logEntry = `[${new Date().toISOString()}] QUERY: ${JSON.stringify(e, null, 2)}\n`;
    fs.appendFileSync(path.join(logsDir, 'prisma-queries.log'), logEntry);
  }
});

// Error logging
prisma.$on('error' as never, (e: any) => {
  metrics.incrementError();
  const logEntry = `[${new Date().toISOString()}] ERROR: ${JSON.stringify(e, null, 2)}\n`;
  fs.appendFileSync(path.join(logsDir, 'prisma-errors.log'), logEntry);
  console.error('Prisma error:', e);
});

// Warning logging
prisma.$on('warn' as never, (e: any) => {
  const logEntry = `[${new Date().toISOString()}] WARN: ${JSON.stringify(e, null, 2)}\n`;
  fs.appendFileSync(path.join(logsDir, 'prisma-warnings.log'), logEntry);
  console.warn('Prisma warning:', e);
});

// Create extended prisma client with custom query methods
export const prismaExtended = createExtendedPrismaClient(prisma);

// Export Prisma types and utilities
export * from '@prisma/client';
export { metrics } from './metrics';
export { withTransaction, connectWithRetry, disconnect } from './utils';
export type { ExtendedPrismaClient } from './extensions';
export {
  findSimilarEvents,
  findSimilarVenues,
  calculateEventSimilarity,
  findPotentialDuplicates,
} from './vector';
