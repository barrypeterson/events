import express, { Application } from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './lib/logger';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import { rateLimiter } from './middleware/rate-limit';
import { requestLogger } from './middleware/logger';
import { appRouter } from './api/trpc/router';
import { createContext } from './api/trpc/context';
import { healthCheck } from './api/rest/health';
import { prisma } from '@slo-events/database';
import { redis } from './config/redis';

/**
 * SLO Events Platform - Backend API Server
 *
 * Express server with tRPC for type-safe APIs
 * Includes health checks, authentication, rate limiting, and logging
 */

const app: Application = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(corsMiddleware);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(rateLimiter);

// Health check endpoint (before tRPC to avoid overhead)
app.get('/health', healthCheck);

// Test data endpoints (development only)
if (env.ENABLE_TEST_ENDPOINTS && env.NODE_ENV === 'development') {
  const testModule = await import('./api/rest/test');
  const simpleModule = await import('./api/rest/simple-seed');
  app.post('/api/test/seed', testModule.seedTestData);
  app.post('/api/test/simple-seed', simpleModule.simpleSeed);
  app.get('/api/test/data', testModule.getDatabaseStats);
  app.delete('/api/test/clear', testModule.cleanupTestData);
  logger.info('Test endpoints enabled in development mode');
}

// tRPC endpoint
app.use(
  '/api/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      logger.error('tRPC Error', {
        path,
        type,
        code: error.code,
        message: error.message,
        stack: env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    },
  })
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Start the server
 */
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connected successfully');

    // Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server started successfully`, {
        environment: env.NODE_ENV,
        port: env.PORT,
        apiUrl: env.API_URL,
        endpoints: {
          health: `${env.API_URL}/health`,
          trpc: `${env.API_URL}/api/trpc`,
          ...(env.ENABLE_TEST_ENDPOINTS && env.NODE_ENV === 'development'
            ? { test: `${env.API_URL}/api/test` }
            : {}),
        },
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await prisma.$disconnect();
          logger.info('Database disconnected');

          await redis.quit();
          logger.info('Redis disconnected');

          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export app for testing
export { app };
