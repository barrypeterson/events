import { ProxyAgent } from 'undici';
import { logger } from './scraper-utils';

/**
 * Residential proxy plumbing for scrapers. Reads a single env var —
 * `SCRAPER_PROXY_URL=http://user:pass@host:port` — and exposes the pieces
 * that Playwright and Node fetch each need.
 *
 * Unset env var = no proxy, everything falls through to direct connections.
 * This is what we want in local dev. Railway sets the var in prod.
 */

interface PlaywrightProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

function parse(): { pw: PlaywrightProxyConfig; agent: ProxyAgent; host: string } | null {
  const raw = process.env.SCRAPER_PROXY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const pw: PlaywrightProxyConfig = {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
    };
    if (u.username) pw.username = decodeURIComponent(u.username);
    if (u.password) pw.password = decodeURIComponent(u.password);
    const agent = new ProxyAgent(raw);
    return { pw, agent, host: u.hostname };
  } catch (err: any) {
    logger.warn(`[proxy] SCRAPER_PROXY_URL is set but invalid: ${err?.message || err}. Running without proxy.`);
    return null;
  }
}

const state = parse();

if (state) {
  logger.info(`[proxy] Residential proxy enabled via ${state.host}`);
} else {
  logger.info('[proxy] No proxy configured (SCRAPER_PROXY_URL unset) — direct connections');
}

export function playwrightProxy(): PlaywrightProxyConfig | undefined {
  return state?.pw;
}

export function fetchDispatcher(): ProxyAgent | undefined {
  return state?.agent;
}

export function isProxyEnabled(): boolean {
  return state !== null;
}
