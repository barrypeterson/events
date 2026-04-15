#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function testCoreWordsMatching() {
  try {
    const eventId = '433bca06-797a-4be1-a6ea-eab590315139'; // Sweet Spots Dance Party

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });

    if (!event) {
      console.log('Event not found');
      return;
    }

    console.log('Testing core words matching for:');
    console.log(`  Title: ${event.title}`);
    console.log(`  Normalized: ${event.normalizedTitle}`);
    console.log(`  Venue: ${event.venue.name} (${event.venueId})`);
    console.log(`  Start: ${event.startDateTime}`);
    console.log();

    // Extract core words using same logic as deduplicator
    const stopWords = new Set(['at', 'the', 'and', 'with', 'live', 'night', 'show', 'event', 'concert', 'series', 'music', 'free', 'afternoon', 'evening', 'morning']);
    const coreWords = event.normalizedTitle
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 3);

    console.log('Core words extracted:');
    console.log(`  Words: [${coreWords.join(', ')}]`);
    console.log(`  Pattern: ${coreWords.join('.*')}`);
    console.log();

    if (coreWords.length < 2) {
      console.log('Not enough core words (need at least 2)');
      return;
    }

    const coreWordPattern = coreWords.join('.*');

    // Run the same query as the deduplicator
    const matches = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      normalized_title: string;
      start_datetime: Date;
      time_diff_hours: number;
    }>>`
      SELECT id, title, normalized_title, start_datetime,
             ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) as time_diff_hours
      FROM events
      WHERE venue_id = ${event.venueId}::uuid
      AND DATE(start_datetime) = DATE(${event.startDateTime}::timestamptz)
      AND normalized_title ~ ${coreWordPattern}
      AND status = 'ACTIVE'
      AND id != ${event.id}::uuid
      ORDER BY created_at ASC
    `;

    console.log(`Found ${matches.length} matching events:\n`);

    matches.forEach((match, idx) => {
      const meetsTimeRequirement = match.time_diff_hours <= 8;

      console.log(`[${idx + 1}] ${match.title}`);
      console.log(`    ID: ${match.id}`);
      console.log(`    Normalized: ${match.normalized_title}`);
      console.log(`    Start: ${match.start_datetime.toLocaleString()}`);
      console.log(`    Time diff: ${match.time_diff_hours.toFixed(2)} hours`);
      console.log(`    Meets time requirement (≤8h): ${meetsTimeRequirement ? '✓ YES' : '✗ NO'}`);

      // Test if pattern matches
      const regex = new RegExp(coreWordPattern);
      console.log(`    Matches pattern: ${regex.test(match.normalized_title) ? '✓ YES' : '✗ NO'}`);
      console.log();
    });

    console.log('='.repeat(80));
    console.log('CONCLUSION');
    console.log('='.repeat(80));

    if (matches.length > 0) {
      const validMatches = matches.filter(m => m.time_diff_hours <= 8);
      if (validMatches.length > 0) {
        console.log(`✓ Core words matching SHOULD catch ${validMatches.length} duplicate(s)`);
        console.log('  If not caught, there may be an issue with the deduplicator logic');
      } else {
        console.log('✗ Matches found but outside 8-hour time window');
      }
    } else {
      console.log('✗ No matches found with core words pattern');
      console.log('  This indicates a problem with the regex pattern or core word extraction');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

testCoreWordsMatching();
