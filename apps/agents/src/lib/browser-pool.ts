import { chromium, type Browser, type BrowserContext, type BrowserContextOptions } from 'playwright';
import { logger } from './scraper-utils';

const isLinux = process.platform === 'linux';

const STEALTH_CONTEXT: BrowserContextOptions = {
  viewport: { width: 1920, height: 1080 },
  userAgent: isLinux
    ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  extraHTTPHeaders: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': isLinux ? '"Linux"' : '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },
};

const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  window.chrome = { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
`;

class BrowserPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;

    // Prevent concurrent launches
    if (this.launching) return this.launching;

    this.launching = chromium.launch({
      headless: true,
      args: process.env.CI || process.env.CONTAINER ? ['--no-sandbox'] : [],
    }).then(browser => {
      this.browser = browser;
      this.launching = null;

      browser.on('disconnected', () => {
        logger.warn('Browser disconnected, will relaunch on next request');
        this.browser = null;
      });

      logger.info('Browser pool: Chromium launched');
      return browser;
    });

    return this.launching;
  }

  async createContext(overrides?: Partial<BrowserContextOptions>): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({ ...STEALTH_CONTEXT, ...overrides });
    await context.addInitScript(STEALTH_INIT_SCRIPT);
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
