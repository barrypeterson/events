import type { Page } from 'playwright';
import type { PageAnalysis } from '../types';
import { logger } from './scraper-utils';
import { browserPool } from './browser-pool';
import { pickFingerprintExcept, fetchHeaders } from './stealth-fingerprints';
import { humanScroll, humanDelay, jitter } from './human-timing';
import { fetchDispatcher, isProxyEnabled } from './proxy';

export interface NavigateOptions {
  /**
   * Force the request through the residential proxy. Set by the caller for
   * venues already known to block our datacenter IP (VenueScraperConfig.requiresProxy).
   */
  useProxy?: boolean;
  /**
   * Invoked when a direct attempt is blocked but a subsequent proxy attempt
   * succeeds. Lets the caller persist `requiresProxy=true` on the config so
   * future runs skip the pointless direct attempt.
   */
  onProxyEscalation?: () => void | Promise<void>;
}

/**
 * Extract clean visible text from a rendered page.
 * Strips scripts, styles, SVG, nav, footer noise.
 * Returns ~5-15KB vs 150KB raw HTML.
 */
export async function getCleanPageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, svg, link[rel="stylesheet"]').forEach(el => el.remove());
    return clone.innerText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
  });
}

/**
 * Extract clean text with image URLs preserved in context.
 * Walks the DOM in order. When a background-image or img is found,
 * inserts an [IMAGE: url] marker. The LLM sees the image URL right
 * next to the event text it belongs to.
 */
export async function getCleanPageTextWithImages(page: Page): Promise<string> {
  return page.evaluate(() => {
    const skipImg = /logo|icon|spacer|pixel|avatar|badge|arrow|chevron|rough-edge|footer-bg|SB-Logo|Pressed-White/i;
    const skipLink = /^#|^javascript:|^mailto:/;
    const skipEl = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'LINK', 'META']);
    const output: string[] = [];
    const seenImages = new Set<string>();
    const seenLinks = new Set<string>();

    // Use a stack-based walk to avoid named functions (tsx __name bug in page.evaluate)
    const stack: Node[] = [document.body];
    while (stack.length > 0) {
      const node = stack.pop()!;

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (skipEl.has(el.tagName)) continue;

        // Check background-image
        const style = el.getAttribute('style') || '';
        if (style.includes('background-image')) {
          const m = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
          if (m && !skipImg.test(m[1]) && !seenImages.has(m[1])) {
            seenImages.add(m[1]);
            output.push(`[IMAGE: ${m[1]}]`);
          }
        }

        // Check img src
        if (el.tagName === 'IMG') {
          const src = el.getAttribute('src') || '';
          if (src && !src.startsWith('data:') && !skipImg.test(src)) {
            const full = src.startsWith('http') ? src : new URL(src, window.location.origin).href;
            if (!seenImages.has(full)) {
              seenImages.add(full);
              output.push(`[IMAGE: ${full}]`);
            }
          }
        }

        // Check links (a href) — include all non-trivial links, let the LLM
        // decide which are event/ticket links vs spam/navigation
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          if (href && !skipLink.test(href)) {
            const full = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
            if (!seenLinks.has(full)) {
              seenLinks.add(full);
              output.push(`[LINK: ${full}]`);
            }
          }
        }
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').trim();
        if (text) output.push(text);
      }

      // Push children in reverse order so first child is processed first
      const children = node.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    return output.filter(Boolean).join('\n');
  });
}

/**
 * Wait for page content to fully load based on analysis config.
 */
export async function waitForContent(
  page: Page,
  analysis?: PageAnalysis | null,
): Promise<void> {
  const strategy = analysis?.waitStrategy || 'networkidle';

  try {
    switch (strategy) {
      case 'selector':
        if (analysis?.waitValue) {
          await page.waitForSelector(analysis.waitValue, { timeout: 15000 });
        }
        break;
      case 'timeout':
        await page.waitForTimeout(parseInt(analysis?.waitValue || '3000'));
        break;
      case 'networkidle':
      default:
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        break;
    }
  } catch (err) {
    // Fallback: wait a few seconds if the primary strategy fails
    logger.warn(`Wait strategy "${strategy}" failed, falling back to 3s timeout`);
    await page.waitForTimeout(3000);
  }

  // Extra delay for lazy-loaded content
  if (analysis?.requiresScrolling) {
    await autoScroll(page);
  }
}

/**
 * Scroll the page to trigger lazy-loaded content.
 */
async function autoScroll(page: Page): Promise<void> {
  await humanScroll(page);
}

const BLOCK_STATUSES = new Set([401, 403, 406, 409, 418, 429, 451, 503]);
const MIN_USEFUL_HTML = 2000;
const MIN_USEFUL_CLEAN = 200;

/**
 * Short identifier for a fingerprint used in log lines. The full UA string is
 * 120+ chars of noise in logs; `macOS/Chrome131` is enough to tell them apart.
 */
function fpId(fp: { userAgent: string; platform: string }): string {
  const version = fp.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '?';
  return `${fp.platform}/Chrome${version}`;
}

interface NavOutcome {
  phase: 'fetch' | 'playwright';
  attempt: number;
  status: number;
  cleanLen: number;
  elapsedMs: number;
  verdict: 'resolved' | 'blocked' | 'thin' | 'threw' | 'skipped-spa' | 'http-error';
  detail?: string;
  fingerprint?: string;
}

function logAttempt(url: string, outcome: NavOutcome): void {
  const line = [
    `[navigate]`,
    url,
    `phase=${outcome.phase}`,
    `attempt=${outcome.attempt}`,
    outcome.fingerprint ? `fp=${outcome.fingerprint}` : null,
    `status=${outcome.status || '-'}`,
    `clean=${outcome.cleanLen}`,
    `ms=${outcome.elapsedMs}`,
    `verdict=${outcome.verdict}`,
    outcome.detail ? `detail="${outcome.detail}"` : null,
  ]
    .filter(Boolean)
    .join(' ');
  if (outcome.verdict === 'resolved') {
    logger.info(line);
  } else if (outcome.verdict === 'threw' || outcome.verdict === 'blocked') {
    logger.warn(line);
  } else {
    logger.info(line);
  }
}

/**
 * Run the page HTML through the same cleaning walk as getCleanPageTextWithImages,
 * but in Node (cheerio-free, regex-light). Works for static pages we can fetch
 * directly without a browser — which is the hardest case for bot detection
 * because there's no Chromium fingerprint at all.
 *
 * Returns `null` only when the response looks like a JS-rendered shell we can't
 * handle here (caller should fall through to Playwright). For all other outcomes
 * returns an object so the caller can log the status code it saw.
 */
async function fetchAndClean(
  url: string,
  attempt: number,
  useProxy: boolean,
): Promise<{ cleanText: string; status: number; fp: string; elapsedMs: number; verdict: NavOutcome['verdict']; detail?: string } | null> {
  const fp = pickFingerprintExcept(new Set());
  const fpLabel = fpId(fp);
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const dispatcher = useProxy ? fetchDispatcher() : undefined;
    const res = await fetch(url, {
      headers: fetchHeaders(fp),
      redirect: 'follow',
      signal: controller.signal,
      // `dispatcher` is an undici option not in the standard fetch type, but
      // Node 20's fetch is undici under the hood and honours it.
      ...(dispatcher ? ({ dispatcher } as any) : {}),
    });
    clearTimeout(timeout);
    const status = res.status;
    const elapsedMs = Date.now() - start;
    if (!res.ok) {
      return {
        cleanText: '',
        status,
        fp: fpLabel,
        elapsedMs,
        verdict: BLOCK_STATUSES.has(status) ? 'blocked' : 'http-error',
      };
    }
    const html = await res.text();
    if (html.length < MIN_USEFUL_HTML) {
      return {
        cleanText: '',
        status,
        fp: fpLabel,
        elapsedMs: Date.now() - start,
        verdict: 'thin',
        detail: `html=${html.length}b`,
      };
    }

    // If the response is almost all <script> (SPA shell), don't try to clean it
    // here — the browser path is needed to run the JS.
    const scriptRatio = (html.match(/<script/gi)?.length ?? 0) * 500 / html.length;
    if (scriptRatio > 0.4 && !/<article|<main|<section|<h[1-3]/i.test(html)) {
      return null;
    }

    const cleanText = cleanHtmlString(html, url);
    const totalMs = Date.now() - start;
    if (cleanText.length < MIN_USEFUL_CLEAN) {
      return { cleanText, status, fp: fpLabel, elapsedMs: totalMs, verdict: 'thin' };
    }
    return { cleanText, status, fp: fpLabel, elapsedMs: totalMs, verdict: 'resolved' };
  } catch (err: any) {
    return {
      cleanText: '',
      status: 0,
      fp: fpLabel,
      elapsedMs: Date.now() - start,
      verdict: 'threw',
      detail: err?.message || String(err),
    };
  } finally {
    void attempt;
  }
}

function cleanHtmlString(html: string, baseUrl: string): string {
  const skipImg = /logo|icon|spacer|pixel|avatar|badge|arrow|chevron|rough-edge|footer-bg|SB-Logo|Pressed-White/i;
  const skipLink = /^#|^javascript:|^mailto:/;

  // Drop script/style/noscript/svg blocks wholesale.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const out: string[] = [];
  const seenImg = new Set<string>();
  const seenLink = new Set<string>();
  const resolve = (href: string) => (href.startsWith('http') ? href : new URL(href, baseUrl).href);

  // Walk tags linearly so images/links appear in document order alongside text.
  const tokenRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|<\/([a-zA-Z][a-zA-Z0-9-]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(stripped)) !== null) {
    const [, openTag, attrs, , text] = m;
    if (openTag) {
      const tag = openTag.toLowerCase();
      if (tag === 'img') {
        const src = attrs?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
        if (src && !src.startsWith('data:') && !skipImg.test(src)) {
          const full = resolve(src);
          if (!seenImg.has(full)) {
            seenImg.add(full);
            out.push(`[IMAGE: ${full}]`);
          }
        }
      } else if (tag === 'a') {
        const href = attrs?.match(/\bhref=["']([^"']+)["']/i)?.[1];
        if (href && !skipLink.test(href)) {
          try {
            const full = resolve(href);
            if (!seenLink.has(full)) {
              seenLink.add(full);
              out.push(`[LINK: ${full}]`);
            }
          } catch {
            /* malformed href */
          }
        }
      }
      const style = attrs?.match(/\bstyle=["']([^"']+)["']/i)?.[1];
      if (style?.includes('background-image')) {
        const url = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/)?.[1];
        if (url && !skipImg.test(url) && !seenImg.has(url)) {
          seenImg.add(url);
          out.push(`[IMAGE: ${url}]`);
        }
      }
    } else if (text) {
      const decoded = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
      if (decoded) out.push(decoded);
    }
  }
  return out
    .join('\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
}

async function warmUp(page: Page, targetHost: string): Promise<void> {
  // Neutral referer establishes Sec-Fetch-Site: cross-site (the most common
  // browser case) instead of 'none', which is the tell of a directly-typed URL.
  const warmUrls = [
    'https://www.google.com/',
    'https://duckduckgo.com/',
  ];
  const warm = warmUrls[Math.floor(Math.random() * warmUrls.length)];
  try {
    await page.goto(warm, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await humanDelay(page, 400, 1200);
  } catch {
    // Warm-up is best-effort; proceed to target even if it fails.
  }
  void targetHost;
}

async function playwrightAttempt(
  url: string,
  analysis: PageAnalysis | null | undefined,
  attempt: number,
  rejectedUAs: Set<string>,
  useProxy: boolean,
): Promise<{ cleanText: string; status: number; fp: string; elapsedMs: number; verdict: NavOutcome['verdict']; detail?: string }> {
  const fp = pickFingerprintExcept(rejectedUAs);
  rejectedUAs.add(fp.userAgent);
  const fpLabel = fpId(fp);
  const start = Date.now();
  const context = await browserPool.createContext(undefined, fp, useProxy);
  const page = await context.newPage();
  try {
    if (attempt > 1) {
      const { hostname } = new URL(url);
      await warmUp(page, hostname);
    } else {
      await humanDelay(page, 100, 400);
    }

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    const status = response?.status() || 0;
    if (status && status >= 400) {
      return {
        cleanText: '',
        status,
        fp: fpLabel,
        elapsedMs: Date.now() - start,
        verdict: BLOCK_STATUSES.has(status) ? 'blocked' : 'http-error',
      };
    }

    await humanDelay(page, 200, 700);
    await waitForContent(page, analysis);
    const cleanText = await getCleanPageTextWithImages(page);
    const elapsedMs = Date.now() - start;
    return {
      cleanText,
      status,
      fp: fpLabel,
      elapsedMs,
      verdict: cleanText.length >= MIN_USEFUL_CLEAN ? 'resolved' : 'thin',
    };
  } catch (err: any) {
    return {
      cleanText: '',
      status: 0,
      fp: fpLabel,
      elapsedMs: Date.now() - start,
      verdict: 'threw',
      detail: err?.message || String(err),
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Navigate to a URL with stealth context and wait for content.
 *
 * Strategy, cheapest-to-most-expensive:
 *   1. Plain fetch() with a rotating Chrome UA. Zero fingerprint, works for
 *      any site whose HTML is present in the raw response (most venues).
 *   2. Playwright with a stealth-patched Chromium and one of five realistic
 *      fingerprints. Handles JS-rendered pages.
 *   3. Retry playwright with a different fingerprint and a warm-up referer.
 *      Handles sites that block the first fingerprint or the no-referer case.
 */
export async function navigateAndExtract(
  pageOrUnused: Page | null,
  url: string,
  analysis?: PageAnalysis | null,
  options?: NavigateOptions,
): Promise<{ cleanText: string; status: number }> {
  void pageOrUnused; // retained in signature for caller compatibility

  const overallStart = Date.now();
  const useProxyInitial = options?.useProxy === true;

  const firstPass = await runNavigation(url, analysis, useProxyInitial);

  // Escalation: direct attempts failed with a block-status verdict, proxy is
  // configured, and the caller hadn't already asked for it. Try once more
  // through the proxy; if it resolves, notify the caller so they can persist
  // `requiresProxy=true` and skip the direct attempts on future runs.
  if (
    !useProxyInitial &&
    firstPass.terminalVerdict === 'blocked' &&
    isProxyEnabled()
  ) {
    logger.warn(
      `[navigate] ${url} ESCALATING to proxy after direct=blocked (last_status=${firstPass.status})`,
    );
    const proxied = await runNavigation(url, analysis, true);
    if (proxied.resolved) {
      logger.info(
        `[navigate] ${url} DONE via proxy-escalation status=${proxied.status} clean=${proxied.cleanText.length} total_ms=${Date.now() - overallStart}`,
      );
      if (options?.onProxyEscalation) {
        try {
          await options.onProxyEscalation();
        } catch (err: any) {
          logger.warn(`[navigate] onProxyEscalation callback threw: ${err?.message || err}`);
        }
      }
      return { cleanText: proxied.cleanText, status: proxied.status };
    }
    logger.warn(
      `[navigate] ${url} proxy-escalation failed status=${proxied.status} verdict=${proxied.terminalVerdict}`,
    );
  }

  if (firstPass.resolved) {
    return { cleanText: firstPass.cleanText, status: firstPass.status };
  }
  if (firstPass.thrown) {
    throw firstPass.thrown;
  }
  return { cleanText: firstPass.cleanText, status: firstPass.status };
}

interface NavigationOutcome {
  resolved: boolean;
  cleanText: string;
  status: number;
  terminalVerdict: NavOutcome['verdict'];
  thrown?: Error;
}

async function runNavigation(
  url: string,
  analysis: PageAnalysis | null | undefined,
  useProxy: boolean,
): Promise<NavigationOutcome> {
  const pageType = analysis?.pageType;
  const canFetch = pageType === 'static' || pageType === undefined || pageType === null;

  logger.info(
    `[navigate] ${url} start pageType=${pageType ?? 'unknown'} canFetch=${canFetch} useProxy=${useProxy}`,
  );

  let lastStatus = 0;
  let lastVerdict: NavOutcome['verdict'] = 'threw';

  if (canFetch) {
    const fetchResult = await fetchAndClean(url, 1, useProxy);
    if (fetchResult === null) {
      logAttempt(url, {
        phase: 'fetch',
        attempt: 1,
        status: 0,
        cleanLen: 0,
        elapsedMs: 0,
        verdict: 'skipped-spa',
      });
    } else {
      logAttempt(url, {
        phase: 'fetch',
        attempt: 1,
        status: fetchResult.status,
        cleanLen: fetchResult.cleanText.length,
        elapsedMs: fetchResult.elapsedMs,
        verdict: fetchResult.verdict,
        detail: fetchResult.detail,
        fingerprint: fetchResult.fp,
      });
      lastStatus = fetchResult.status;
      lastVerdict = fetchResult.verdict;
      if (fetchResult.verdict === 'resolved') {
        return {
          resolved: true,
          cleanText: fetchResult.cleanText,
          status: fetchResult.status,
          terminalVerdict: 'resolved',
        };
      }
    }
  } else {
    logger.info(`[navigate] ${url} fetch path skipped (pageType=${pageType})`);
  }

  const rejectedUAs = new Set<string>();
  const maxAttempts = 3;
  let lastCleanText = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await playwrightAttempt(url, analysis, attempt, rejectedUAs, useProxy);
      logAttempt(url, {
        phase: 'playwright',
        attempt,
        status: result.status,
        cleanLen: result.cleanText.length,
        elapsedMs: result.elapsedMs,
        verdict: result.verdict,
        detail: result.detail,
        fingerprint: result.fp,
      });
      lastStatus = result.status;
      lastVerdict = result.verdict;
      lastCleanText = result.cleanText;

      if (result.verdict === 'resolved') {
        return {
          resolved: true,
          cleanText: result.cleanText,
          status: result.status,
          terminalVerdict: 'resolved',
        };
      }

      if (attempt < maxAttempts) {
        const wait = jitter(1500, 3500);
        logger.info(`[navigate] ${url} retrying in ${wait}ms (reason=${result.verdict})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      // Last attempt, non-resolved: fall through to return the verdict
    } catch (err: any) {
      logAttempt(url, {
        phase: 'playwright',
        attempt,
        status: 0,
        cleanLen: 0,
        elapsedMs: 0,
        verdict: 'threw',
        detail: err?.message || String(err),
      });
      lastVerdict = 'threw';
      if (attempt === maxAttempts) {
        return {
          resolved: false,
          cleanText: '',
          status: 0,
          terminalVerdict: 'threw',
          thrown: err instanceof Error ? err : new Error(String(err)),
        };
      }
      await new Promise(r => setTimeout(r, jitter(1500, 3500)));
    }
  }

  logger.warn(
    `[navigate] ${url} EXHAUSTED last_status=${lastStatus} last_verdict=${lastVerdict} useProxy=${useProxy}`,
  );
  return {
    resolved: false,
    cleanText: lastCleanText,
    status: lastStatus,
    terminalVerdict: lastVerdict,
  };
}
