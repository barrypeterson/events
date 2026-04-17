import type { Page } from 'playwright';

export function jitter(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

export async function humanDelay(page: Page, minMs = 150, maxMs = 600): Promise<void> {
  await page.waitForTimeout(jitter(minMs, maxMs));
}

/**
 * Move the mouse through 3-5 intermediate points to the target. Detectors that
 * look for instant teleports (0-frame mouse jumps) stop flagging this.
 */
export async function humanMouseTo(page: Page, x: number, y: number): Promise<void> {
  const steps = 3 + Math.floor(Math.random() * 3);
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  let curX = Math.floor(Math.random() * vp.width);
  let curY = Math.floor(Math.random() * vp.height);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nextX = Math.floor(curX + (x - curX) * t + (Math.random() * 10 - 5));
    const nextY = Math.floor(curY + (y - curY) * t + (Math.random() * 10 - 5));
    await page.mouse.move(nextX, nextY, { steps: 5 });
    await page.waitForTimeout(jitter(20, 80));
    curX = nextX;
    curY = nextY;
  }
}

/**
 * Scroll in variable-sized steps with pauses, the way a human reading down a
 * page does. Used to trigger lazy-loaded content without the constant-distance
 * interval pattern that screams "bot."
 */
export async function humanScroll(page: Page, maxDurationMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxDurationMs) {
    const distance = jitter(200, 600);
    const done = await page.evaluate((d) => {
      window.scrollBy(0, d);
      return window.scrollY + window.innerHeight >= document.body.scrollHeight - 50;
    }, distance);
    await page.waitForTimeout(jitter(300, 900));
    if (done) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(jitter(200, 500));
}
