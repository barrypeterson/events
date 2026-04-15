#!/usr/bin/env node

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { cleanText } from './lib/scraper-utils';

async function main() {
  console.log('🔍 Visual debugging of The Siren page...\n');

  const browser = await chromium.launch({
    headless: false,  // SHOW THE BROWSER
    slowMo: 1000      // Slow down so you can see what's happening
  });

  const page = await browser.newPage();

  console.log('📄 Navigating to https://thesirenmorrobay.com/events/list/');
  await page.goto('https://thesirenmorrobay.com/events/list/', { waitUntil: 'networkidle' });

  console.log('⏳ Waiting 5 seconds for all content to load...');
  await page.waitForTimeout(5000);

  // Take a screenshot
  await page.screenshot({ path: '/tmp/siren-screenshot.png', fullPage: true });
  console.log('📸 Screenshot saved to /tmp/siren-screenshot.png');

  // Get HTML
  const html = await page.content();
  const $ = cheerio.load(html);

  console.log('\n📊 Analysis:');
  console.log(`  Total HTML length: ${html.length}`);
  console.log(`  div.ecs-event count: ${$('div.ecs-event').length}`);
  console.log(`  #eventList count: ${$('#eventList').length}`);
  console.log(`  .ecs-venue-details a count: ${$('.ecs-venue-details a').length}`);

  // Try to extract events
  console.log('\n🎫 Attempting to extract events:\n');

  let count = 0;
  $('[id="eventList"]').each((i, element) => {
    const $el = $(element);
    const title = cleanText($el.find('.ecs-venue-details a').first().text());
    const date = cleanText($el.find('.tribe-event-date-start').first().text());

    console.log(`  ${i + 1}. Title: "${title}"`);
    console.log(`     Date: "${date}"`);

    if (title && title.length > 0) {
      count++;
    }
  });

  console.log(`\n✅ Found ${count} events with valid titles`);

  console.log('\n⏸️  Browser will stay open for 30 seconds so you can inspect...');
  await page.waitForTimeout(30000);

  await browser.close();
  console.log('\n✅ Done!');
}

main().catch(console.error);
