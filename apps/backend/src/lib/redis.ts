import { redis } from '../config/redis';
import { logger } from './logger';

/**
 * Cache utilities for Redis
 */

export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

/**
 * Get cached data
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error('Redis get error:', { key, error });
    return null;
  }
}

/**
 * Set cached data with TTL
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<boolean> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error('Redis set error:', { key, error });
    return false;
  }
}

/**
 * Delete cached data
 */
export async function deleteCache(key: string): Promise<boolean> {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Redis delete error:', { key, error });
    return false;
  }
}

/**
 * Delete all keys matching pattern
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch (error) {
    logger.error('Redis delete pattern error:', { pattern, error });
    return 0;
  }
}

/**
 * Check if key exists
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis exists error:', { key, error });
    return false;
  }
}

/**
 * Get remaining TTL for key
 */
export async function getCacheTTL(key: string): Promise<number> {
  try {
    return await redis.ttl(key);
  } catch (error) {
    logger.error('Redis TTL error:', { key, error });
    return -1;
  }
}

/**
 * Increment counter with optional TTL
 */
export async function incrementCounter(
  key: string,
  ttl?: number
): Promise<number> {
  try {
    const value = await redis.incr(key);
    if (ttl && value === 1) {
      await redis.expire(key, ttl);
    }
    return value;
  } catch (error) {
    logger.error('Redis increment error:', { key, error });
    return 0;
  }
}

/**
 * Get counter value
 */
export async function getCounter(key: string): Promise<number> {
  try {
    const value = await redis.get(key);
    return value ? parseInt(value, 10) : 0;
  } catch (error) {
    logger.error('Redis get counter error:', { key, error });
    return 0;
  }
}
