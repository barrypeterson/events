#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const eventIds = [
  'c25e18c7-78f9-4121-bf21-7a9d56e25db5',
  '3195f9e4-3e98-42b0-a708-4dd9990e5a51'
];

async function analyzeEvents() {
  try {
    console.log('Fetching events...\n');

    for (const id of eventIds) {
      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          venue: true,
          sources: true,
        },
      });

      if (!event) {
        console.log(`Event ${id} not found`);
        continue;
      }

      console.log('='.repeat(80));
      console.log(`Event: ${event.title}`);
      console.log('='.repeat(80));
      console.log(`ID: ${event.id}`);
      console.log(`Normalized Title: ${event.normalizedTitle}`);
      console.log(`Venue: ${event.venue.name} (${event.venueId})`);
      console.log(`Start DateTime: ${event.startDateTime}`);
      console.log(`End DateTime: ${event.endDateTime}`);
      console.log(`Category: ${event.category.join(', ')}`);
      console.log(`Tags: ${event.tags.join(', ')}`);
      console.log(`Sources: ${event.sources.map(s => s.sourceName).join(', ')}`);
      console.log(`Created: ${event.createdAt}`);
      console.log();
    }

    // Calculate similarity
    const [event1, event2] = await Promise.all(
      eventIds.map(id => prisma.event.findUnique({
        where: { id },
        include: { venue: true }
      }))
    );

    if (event1 && event2) {
      console.log('='.repeat(80));
      console.log('COMPARISON');
      console.log('='.repeat(80));

      console.log(`\nVenue Match: ${event1.venueId === event2.venueId ? '✓ YES' : '✗ NO'}`);
      console.log(`  Event 1: ${event1.venue.name}`);
      console.log(`  Event 2: ${event2.venue.name}`);

      const sameDate = event1.startDateTime.toDateString() === event2.startDateTime.toDateString();
      console.log(`\nSame Date: ${sameDate ? '✓ YES' : '✗ NO'}`);
      console.log(`  Event 1: ${event1.startDateTime.toLocaleString()}`);
      console.log(`  Event 2: ${event2.startDateTime.toLocaleString()}`);

      const timeDiffHours = Math.abs(
        event1.startDateTime.getTime() - event2.startDateTime.getTime()
      ) / (1000 * 60 * 60);
      console.log(`\nTime Difference: ${timeDiffHours.toFixed(2)} hours`);
      console.log(`  Within 6 hours: ${timeDiffHours < 6 ? '✓ YES' : '✗ NO'}`);
      console.log(`  Exact same time: ${timeDiffHours === 0 ? '✓ YES' : '✗ NO'}`);

      // Calculate title similarity using PostgreSQL
      const result = await prisma.$queryRaw<Array<{ similarity: number }>>`
        SELECT similarity(${event1.normalizedTitle}, ${event2.normalizedTitle}) as similarity
      `;

      const titleSimilarity = result[0].similarity;
      console.log(`\nTitle Similarity: ${(titleSimilarity * 100).toFixed(1)}%`);
      console.log(`  Event 1: "${event1.title}"`);
      console.log(`  Event 2: "${event2.title}"`);
      console.log(`  Normalized 1: "${event1.normalizedTitle}"`);
      console.log(`  Normalized 2: "${event2.normalizedTitle}"`);
      console.log(`  Meets 70% threshold: ${titleSimilarity > 0.7 ? '✓ YES' : '✗ NO'}`);

      console.log('\n' + '='.repeat(80));
      console.log('CONCLUSION');
      console.log('='.repeat(80));

      if (event1.venueId === event2.venueId && sameDate && timeDiffHours < 6 && titleSimilarity > 0.7) {
        console.log('✓ These events WOULD be caught by current fuzzy matching');
      } else if (event1.venueId === event2.venueId && sameDate && timeDiffHours === 0) {
        console.log('⚠ These events have SAME venue, date, and time but different titles');
        console.log(`  Title similarity (${(titleSimilarity * 100).toFixed(1)}%) is below 70% threshold`);
        console.log('  → Need to add exact time matching logic');
      } else {
        console.log('✗ These events do not match current criteria');
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await disconnect();
  }
}

analyzeEvents();
