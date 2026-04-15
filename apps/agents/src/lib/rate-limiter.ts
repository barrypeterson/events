import { prisma } from '@slo-events/database';
import { logger } from './scraper-utils';

/**
 * Database-backed rate limiter for external services
 * Ensures no request is lost and provides audit trail
 */
export class ServiceRateLimiter {
  private service: string;
  private maxRequests: number;
  private windowSeconds: number;

  constructor(service: string, maxRequests: number, windowSeconds: number) {
    this.service = service;
    this.maxRequests = maxRequests;
    this.windowSeconds = windowSeconds;
  }

  /**
   * Check if request is allowed, and record it if so
   * Returns true if allowed, false if rate limit exceeded
   */
  async checkAndRecord(endpoint?: string): Promise<{ allowed: boolean; resetAt?: Date; currentCount?: number }> {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.windowSeconds * 1000);

      // Check current window usage
      const currentWindow = await prisma.$queryRaw<Array<{
        total_requests: number;
        window_end: Date;
      }>>`
        SELECT
          COALESCE(SUM(request_count), 0)::int as total_requests,
          MAX(window_end) as window_end
        FROM rate_limit_tracking
        WHERE service = ${this.service}
        AND window_end > ${now}
        ${endpoint ? `AND endpoint = ${endpoint}` : ''}
      `;

      const currentCount = currentWindow[0]?.total_requests || 0;
      const existingWindowEnd = currentWindow[0]?.window_end;

      if (currentCount >= this.maxRequests) {
        logger.warn(`[RateLimiter] ${this.service} rate limit exceeded: ${currentCount}/${this.maxRequests}`);
        return {
          allowed: false,
          resetAt: existingWindowEnd || new Date(now.getTime() + this.windowSeconds * 1000),
          currentCount,
        };
      }

      // Record this request
      await prisma.$executeRaw`
        INSERT INTO rate_limit_tracking (
          service, endpoint, request_count, window_start, window_end, last_request_at
        ) VALUES (
          ${this.service},
          ${endpoint || null},
          1,
          ${now},
          ${new Date(now.getTime() + this.windowSeconds * 1000)},
          ${now}
        )
      `;

      logger.debug(`[RateLimiter] ${this.service} request recorded: ${currentCount + 1}/${this.maxRequests}`);

      return {
        allowed: true,
        currentCount: currentCount + 1,
      };

    } catch (error: any) {
      logger.error(`[RateLimiter] Error checking rate limit: ${error.message}`);
      // Fail open (allow request) to avoid breaking scraper
      return { allowed: true };
    }
  }

  /**
   * Wait until rate limit window resets
   */
  async waitForReset(endpoint?: string): Promise<void> {
    const status = await this.checkAndRecord(endpoint);

    if (!status.allowed && status.resetAt) {
      const waitTime = status.resetAt.getTime() - Date.now();
      if (waitTime > 0) {
        logger.info(`[RateLimiter] ${this.service} rate limit hit. Waiting ${Math.ceil(waitTime / 1000)}s until reset`);
        await new Promise(resolve => setTimeout(resolve, waitTime + 1000)); // Add 1s buffer
      }
    }
  }

  /**
   * Clean up old rate limit records (older than 24 hours)
   */
  static async cleanup(): Promise<number> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const result = await prisma.$executeRaw`
        DELETE FROM rate_limit_tracking
        WHERE window_end < ${oneDayAgo}
      `;

      logger.debug(`[RateLimiter] Cleaned up ${result} old rate limit records`);
      return result as number;
    } catch (error: any) {
      logger.error(`[RateLimiter] Cleanup failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(endpoint?: string): Promise<{
    currentCount: number;
    maxRequests: number;
    resetAt: Date | null;
    remainingRequests: number;
  }> {
    const now = new Date();

    const currentWindow = await prisma.$queryRaw<Array<{
      total_requests: number;
      window_end: Date;
    }>>`
      SELECT
        COALESCE(SUM(request_count), 0)::int as total_requests,
        MAX(window_end) as window_end
      FROM rate_limit_tracking
      WHERE service = ${this.service}
      AND window_end > ${now}
      ${endpoint ? `AND endpoint = ${endpoint}` : ''}
    `;

    const currentCount = currentWindow[0]?.total_requests || 0;
    const resetAt = currentWindow[0]?.window_end || null;

    return {
      currentCount,
      maxRequests: this.maxRequests,
      resetAt,
      remainingRequests: Math.max(0, this.maxRequests - currentCount),
    };
  }
}
