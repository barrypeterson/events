import winston from 'winston';
import { FetchOptions } from '../types';

/**
 * Configure Winston logger
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

/**
 * Rate limiter for HTTP requests
 */
class RateLimiter {
  private lastRequestTime: Map<string, number> = new Map();

  async waitIfNeeded(key: string, delayMs: number): Promise<void> {
    const lastTime = this.lastRequestTime.get(key) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    if (elapsed < delayMs) {
      const waitTime = delayMs - elapsed;
      logger.debug(`Rate limiting: waiting ${waitTime}ms for ${key}`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime.set(key, Date.now());
  }
}

export const rateLimiter = new RateLimiter();

/**
 * HTTP fetch with retry logic and rate limiting
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const {
    timeout = 30000,
    retries = 3,
    headers = {},
    method = 'GET',
    body,
  } = options;

  const defaultHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ...headers,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffDelay = Math.pow(2, attempt) * 1000;
        logger.debug(`Retry attempt ${attempt + 1}, waiting ${backoffDelay}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: defaultHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} for ${url}`
        );
      }

      const html = await response.text();
      logger.debug(`Successfully fetched ${url} (${html.length} bytes)`);
      return html;
    } catch (error: any) {
      lastError = error;
      logger.warn(
        `Fetch attempt ${attempt + 1}/${retries} failed for ${url}: ${error.message}`
      );

      if (attempt === retries - 1) {
        throw new Error(
          `Failed to fetch ${url} after ${retries} attempts: ${error.message}`
        );
      }
    }
  }

  throw lastError || new Error('Unknown fetch error');
}

/**
 * Check robots.txt compliance (simplified)
 */
export async function checkRobotsTxt(
  baseUrl: string,
  path: string
): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const robotsTxt = await fetchWithRetry(robotsUrl, { retries: 1 });

    // Simple check for Disallow directives
    const disallowRules = robotsTxt
      .split('\n')
      .filter((line) => line.trim().startsWith('Disallow:'))
      .map((line) => line.split(':')[1].trim());

    for (const rule of disallowRules) {
      if (rule && path.startsWith(rule)) {
        logger.warn(`Blocked by robots.txt: ${path}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    // If robots.txt doesn't exist or can't be fetched, allow scraping
    logger.debug(`Could not fetch robots.txt for ${baseUrl}, proceeding`);
    return true;
  }
}

/**
 * Normalize string for comparison
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Parse date string with multiple format support
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try common formats
  const formats = [
    // MM/DD/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // Month DD, YYYY
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
    // DD Month YYYY
    /(\d{1,2})\s+(\w+)\s+(\d{4})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      } catch {}
    }
  }

  logger.warn(`Could not parse date: ${dateStr}`);
  return null;
}

/**
 * Clean HTML entities and extra whitespace
 */
export function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sleep for specified milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug(`Retry attempt ${attempt + 1}, waiting ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Chunk array into smaller batches
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
