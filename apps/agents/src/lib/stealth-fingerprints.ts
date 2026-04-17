/**
 * Fingerprint pools for request rotation. Each entry is internally consistent
 * (UA matches Sec-Ch-Ua-Platform matches viewport aspect ratio) so we don't
 * emit the "macOS Chrome on a 1920x1080 monitor claiming to be iPhone" kind
 * of contradictions that fingerprint detectors grade on.
 */

export interface Fingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
  platform: 'macOS' | 'Windows' | 'Linux';
}

const FINGERPRINTS: Fingerprint[] = [
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    platform: 'macOS',
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1680, height: 1050 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    platform: 'macOS',
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    platform: 'Windows',
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    platform: 'Windows',
  },
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    platform: 'Linux',
  },
];

export function pickFingerprint(): Fingerprint {
  return FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
}

export function pickFingerprintExcept(seen: Set<string>): Fingerprint {
  const available = FINGERPRINTS.filter(fp => !seen.has(fp.userAgent));
  const pool = available.length > 0 ? available : FINGERPRINTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Minimal fetch headers that match a real Chrome request. Notably omits
 * Sec-Ch-Ua* — some servers cross-check these against the TLS fingerprint
 * and flag mismatches; only Chromium itself can emit values that match.
 */
export function fetchHeaders(fp: Fingerprint, referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': fp.userAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'cross-site' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
  if (referer) headers.Referer = referer;
  return headers;
}
