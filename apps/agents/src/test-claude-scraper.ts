#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { ClaudeUniversalScraper } from './scrapers/claude-universal';
import { logger } from './lib/scraper-utils';

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  console.log('Testing Claude Universal Scraper on Fremont Theater...\n');

  const scraper = new ClaudeUniversalScraper(
    'fremont-claude',
    'https://www.fremontslo.com/shows',
    'Fremont Theater'
  );

  try {
    const result = await scraper.run();

    console.log('\n✅ Scraper Results:');
    console.log(`  Events found: ${result.eventsFound}`);
    console.log(`  New events: ${result.newEvents}`);
    console.log(`  Updated events: ${result.updatedEvents}`);
    console.log(`  Duplicates: ${result.duplicates}`);
    console.log(`  Errors: ${result.errors.length}`);
    console.log(`  Duration: ${result.duration}ms`);

    if (result.events.length > 0) {
      console.log('\n📅 Sample Events:');
      result.events.slice(0, 3).forEach((event: any) => {
        console.log(`  - ${event.title}`);
        console.log(`    Date: ${event.rawDate} ${event.rawTime || ''}`);
        console.log(`    Price: ${event.rawPrice || 'Not specified'}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
