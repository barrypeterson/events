#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function debug() {
  try {
    const event = await prisma.event.findUnique({
      where: { id: '7e6747de-4230-4afc-bf94-670c02d58efe' }, // The later event
      include: { venue: true },
    });

    if (!event) {
      console.log('Event not found');
      return;
    }

    console.log('Source Event:');
    console.log(`  Title: ${event.title}`);
    console.log(`  Normalized: "${event.normalizedTitle}"`);
    console.log(`  Venue ID: ${event.venueId}`);
    console.log(`  Start: ${event.startDateTime}`);
    console.log();

    // Extract core words
    const stopWords = new Set(['at', 'the', 'and', 'with', 'live', 'night', 'show', 'event', 'concert', 'series', 'music', 'free', 'afternoon', 'evening', 'morning']);
    const coreWords = event.normalizedTitle
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 3);

    console.log('Core words:', coreWords);
    const pattern = coreWords.join('.*');
    console.log('Pattern:', pattern);
    console.log();

    // Query 1: Check all events at same venue within 24 hours
    console.log('Query 1: All events at same venue within 24 hours');
    const allSameDay = await prisma.$queryRaw<Array<{
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
      AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) <= 24
      AND status = 'ACTIVE'
      AND id != ${event.id}::uuid
      ORDER BY start_datetime
    `;
    console.log(`  Found ${allSameDay.length} events`);
    allSameDay.forEach(e => {
      console.log(`    - ${e.title} (${e.id})`);
      console.log(`      Normalized: "${e.normalized_title}"`);
      console.log(`      Time diff: ${e.time_diff_hours.toFixed(2)} hours`);
    });
    console.log();

    // Query 2: Test if regex works on those events
    console.log('Query 2: Which events match the regex pattern?');
    for (const testEvent of allSameDay) {
      const regexTest = await prisma.$queryRaw<Array<{ matches: boolean }>>`
        SELECT (${testEvent.normalized_title} ~ ${pattern}) as matches
      `;
      console.log(`  "${testEvent.normalized_title}"`);
      console.log(`    Regex matches: ${regexTest[0].matches ? '✓ YES' : '✗ NO'}`);
    }
    console.log();

    // Query 3: The full query with all conditions
    console.log('Query 3: Full query with time proximity check');
    const fullQuery = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      time_diff: number;
    }>>`
      SELECT id, title,
             ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) as time_diff
      FROM events
      WHERE venue_id = ${event.venueId}::uuid
      AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) <= 8
      AND normalized_title ~ ${pattern}
      AND status = 'ACTIVE'
      AND id != ${event.id}::uuid
      ORDER BY created_at ASC
    `;

    console.log(`  Found ${fullQuery.length} matches`);
    fullQuery.forEach(m => {
      console.log(`    ✓ ${m.title} (time diff: ${m.time_diff.toFixed(2)}h)`);
    });

    if (fullQuery.length === 0) {
      console.log('  ✗ No matches - investigating why...');

      // Check each condition separately
      console.log('\n  Debugging individual conditions:');

      const checkVenue = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count FROM events
        WHERE venue_id = ${event.venueId}::uuid
        AND id != ${event.id}::uuid
      `;
      console.log(`    Events at same venue: ${checkVenue[0].count}`);

      const checkTime = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count FROM events
        WHERE ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) <= 8
        AND id != ${event.id}::uuid
      `;
      console.log(`    Events within 8 hours: ${checkTime[0].count}`);

      const checkRegex = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count FROM events
        WHERE normalized_title ~ ${pattern}
        AND id != ${event.id}::uuid
      `;
      console.log(`    Events matching regex: ${checkRegex[0].count}`);
    }

  } catch (error: any) {
    console.error('Error:', error);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

debug();
