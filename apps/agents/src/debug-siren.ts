#!/usr/bin/env node

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

async function main() {
  console.log('🔍 Debugging The Siren page with Playwright...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('📄 Navigating to https://thesirenmorrobay.com/events/list/');
  await page.goto('https://thesirenmorrobay.com/events/list/', { waitUntil: 'networkidle' });

  console.log('⏳ Waiting for content to load...');
  await page.waitForTimeout(5000);

  const html = await page.content();
  await browser.close();

  console.log(`\n📊 Page stats:`);
  console.log(`  - HTML length: ${html.length} characters`);

  // Parse with Cheerio to find event elements
  const $ = cheerio.load(html);

  // Common event selectors
  const selectors = [
    '.tribe-events-list-event',
    '.tribe-event',
    'article.event',
    '[class*="event"]',
    '.event-item',
  ];

  console.log(`\n🔎 Looking for event elements:\n`);

  for (const selector of selectors) {
    const count = $(selector).length;
    if (count > 0) {
      console.log(`  ✓ Found ${count} elements with selector: ${selector}`);

      // Show first 3 events
      $(selector).slice(0, 3).each((i, el) => {
        const $el = $(el);
        const title = $el.find('h1, h2, h3, .event-title, .tribe-events-list-event-title').first().text().trim();
        const date = $el.find('.event-date, .tribe-event-date-start, time').first().text().trim();
        console.log(`    ${i + 1}. ${title || '[No title found]'}`);
        console.log(`       Date: ${date || '[No date found]'}`);
      });
    }
  }

  // Search for any text that looks like event titles
  console.log(`\n📝 Searching for event-like content:\n`);

  const text = $('body').text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 100);

  // Look for lines that might be event titles (have dates nearby)
  const eventPatterns = lines.filter(l =>
    /\d{1,2}\/\d{1,2}\/\d{2,4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(l)
  );

  eventPatterns.slice(0, 10).forEach((line, i) => {
    console.log(`  ${i + 1}. ${line.substring(0, 80)}`);
  });

  console.log(`\n💾 Saving HTML to debug file...`);
  const fs = await import('fs');
  fs.writeFileSync('/tmp/siren-debug.html', html);
  console.log(`  Saved to: /tmp/siren-debug.html`);
  console.log(`\nDone! Check the HTML file to see what Playwright captured.`);
}

main().catch(console.error);
