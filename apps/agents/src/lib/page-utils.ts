import type { Page } from 'playwright';
import type { PageAnalysis } from '../types';
import { logger } from './scraper-utils';

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
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
      // Safety: stop after 10 seconds
      setTimeout(() => { clearInterval(timer); resolve(); }, 10000);
    });
  });
  // Wait for any content triggered by scrolling
  await page.waitForTimeout(2000);
}

/**
 * Navigate to a URL with stealth context and wait for content.
 * Returns the clean text of the rendered page.
 */
export async function navigateAndExtract(
  page: Page,
  url: string,
  analysis?: PageAnalysis | null,
): Promise<{ cleanText: string; status: number }> {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  const status = response?.status() || 0;

  await waitForContent(page, analysis);
  const cleanText = await getCleanPageTextWithImages(page);

  return { cleanText, status };
}
