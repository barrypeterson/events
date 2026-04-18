import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
// @ts-expect-error — playwright-extra ships its own types but they don't
// match the playwright ones exactly. We re-type at the boundary.
import { chromium as chromiumExtra } from 'playwright-extra';
// @ts-expect-error — same.
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from './scraper-utils';
import { pickFingerprint, type Fingerprint } from './stealth-fingerprints';
import { playwrightProxy } from './proxy';

// Stealth plugin patches ~20 fingerprinting surfaces (webdriver, chrome.runtime,
// plugins, WebGL vendor, iframe.contentWindow, permissions, media codecs, etc.).
const stealth = StealthPlugin();
// The plugin's iframe.contentWindow evasion is known to throw on some pages;
// safe to disable. Everything else stays on.
stealth.enabledEvasions.delete('iframe.contentWindow');
chromiumExtra.use(stealth);

// Flags that strip the "this is automated" signals Chromium emits by default.
const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

// Final DOM-level patches the stealth plugin doesn't already cover. Kept minimal
// to avoid overriding anything the plugin sets better than we can.
const POST_STEALTH_INIT = `
  // chrome.app / chrome.csi that stealth plugin leaves thin
  if (window.chrome && !window.chrome.app) {
    window.chrome.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
  }
  // Kill the tell-tale 0x0 outer window size when a headless context is first created
  if (window.outerWidth === 0) Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  if (window.outerHeight === 0) Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
`;

function contextOptionsFromFingerprint(fp: Fingerprint, useProxy: boolean): BrowserContextOptions {
  const options: BrowserContextOptions = {
    viewport: fp.viewport,
    userAgent: fp.userAgent,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    // Accept-Language only — Sec-Ch-Ua* are emitted natively by Chromium and
    // must not be injected manually or they contradict the UA-Client-Hints
    // the browser sends, which is itself a detection signal.
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };
  if (useProxy) {
    const proxy = playwrightProxy();
    if (proxy) options.proxy = proxy;
  }
  return options;
}

class BrowserPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    const isContainer = Boolean(process.env.CI || process.env.CONTAINER);
    const args = [...LAUNCH_ARGS];
    if (isContainer) args.push('--no-sandbox');

    // Local debugging: set SCRAPER_HEADLESS=false to watch the browser run.
    // SCRAPER_SLOWMO=250 adds a 250ms delay per Playwright action so you can
    // follow what's happening. SCRAPER_DEVTOOLS=true auto-opens DevTools.
    const headless = process.env.SCRAPER_HEADLESS !== 'false';
    const slowMo = parseInt(process.env.SCRAPER_SLOWMO || '0', 10) || 0;
    const devtools = process.env.SCRAPER_DEVTOOLS === 'true';

    this.launching = chromiumExtra
      .launch({
        headless,
        slowMo,
        devtools,
        args,
        // Hides the '--enable-automation' default flag that advertises CDP control.
        ignoreDefaultArgs: ['--enable-automation'],
      })
      .then((browser: Browser) => {
        this.browser = browser;
        this.launching = null;
        browser.on('disconnected', () => {
          logger.warn('Browser disconnected, will relaunch on next request');
          this.browser = null;
        });
        logger.info(
          `Browser pool: stealth Chromium launched (headless=${headless} slowMo=${slowMo} devtools=${devtools})`,
        );
        return browser;
      });

    return this.launching;
  }

  /**
   * Create a new context with a fresh fingerprint. Pass a fingerprint explicitly
   * to force a specific identity (used by retry logic to rotate per attempt).
   * `useProxy` routes the context through the configured residential proxy;
   * off by default so direct connections stay direct until a venue escalates.
   */
  async createContext(
    overrides?: Partial<BrowserContextOptions>,
    fingerprint?: Fingerprint,
    useProxy = false,
  ): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const fp = fingerprint ?? pickFingerprint();
    const context = await browser.newContext({
      ...contextOptionsFromFingerprint(fp, useProxy),
      ...overrides,
    });
    await context.addInitScript(POST_STEALTH_INIT);
    return context;
  }

  async shutdown(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser pool: shutdown complete');
    }
  }
}

export const browserPool = new BrowserPool();
