import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Redis store for rate limiting
 */
class RedisStore {
  private prefix: string;
  private windowMs: number;

  constructor(prefix: string, windowMs: number) {
    this.prefix = prefix;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redisKey = `${this.prefix}:${key}`;
    const ttl = Math.ceil(this.windowMs / 1000);

    try {
      const multi = redis.multi();
      multi.incr(redisKey);
      multi.expire(redisKey, ttl);
      const results = await multi.exec();

      const totalHits = results?.[0]?.[1] as number;
      const resetTime = new Date(Date.now() + this.windowMs);

      return { totalHits, resetTime };
    } catch (error) {
      logger.error('Rate limit Redis error:', error);
      // Fallback to allowing the request on error
      return { totalHits: 0, resetTime: new Date() };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    try {
      await redis.decr(redisKey);
    } catch (error) {
      logger.error('Rate limit decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    try {
      await redis.del(redisKey);
    } catch (error) {
      logger.error('Rate limit reset error:', error);
    }
  }
}

/**
 * Create rate limiter with Redis store
 */
export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  prefix?: string;
}) {
  const windowMs = options?.windowMs || env.RATE_LIMIT_WINDOW_MS;
  const max = options?.max || env.RATE_LIMIT_MAX_REQUESTS;
  const prefix = options?.prefix || 'rl';

  const store = new RedisStore(prefix, windowMs);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        path: req.path,
      });

      res.status(429).json({
        error: 'Too many requests, please try again later',
      });
    },
    skip: (req) => {
      // Skip rate limiting for health check
      if (req.path === '/health') return true;

      // Skip rate limiting in development
      if (env.NODE_ENV === 'development') return true;

      return false;
    },
    keyGenerator: (req) => {
      // Use IP address as key
      return req.ip || 'unknown';
    },
    store: {
      increment: async (key) => {
        const result = await store.increment(key);
        return result;
      },
      decrement: async (key) => {
        await store.decrement(key);
      },
      resetKey: async (key) => {
        await store.resetKey(key);
      },
    },
  });
}

/**
 * Default rate limiter
 */
export const rateLimiter = createRateLimiter();

/**
 * Strict rate limiter for sensitive endpoints
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  prefix: 'rl:strict',
});

/**
 * Auth rate limiter for login/register endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  prefix: 'rl:auth',
});
