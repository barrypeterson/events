import { Request, Response } from 'express';
import { testDatabaseConnection } from '../../config/database';
import { testRedisConnection } from '../../config/redis';
import { HealthStatus } from '../../types';
import { logger } from '../../lib/logger';
import { asyncHandler } from '../../middleware/error';

/**
 * Health check endpoint
 * Tests database and Redis connections
 */
export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Test services in parallel
  const [dbHealthy, redisHealthy] = await Promise.all([
    testDatabaseConnection(),
    testRedisConnection(),
  ]);

  const allHealthy = dbHealthy && redisHealthy;
  const responseTime = Date.now() - startTime;

  const status: HealthStatus = {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy,
      redis: redisHealthy,
    },
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
  };

  const statusCode = allHealthy ? 200 : 503;

  logger.info('Health check performed', {
    status: status.status,
    responseTime: `${responseTime}ms`,
    services: status.services,
  });

  res.status(statusCode).json(status);
});
