#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { enrichAllVenues } from './lib/venue-enricher';

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  console.log('🏢 Enriching venues with address and location data...\n');

  try {
    await enrichAllVenues();
    console.log('\n✅ Venue enrichment complete!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
