#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const eventIds = [
  'ac67f5b5-fbd3-4c1e-8465-8671efa7aaa5',
  '81d29b00-7dbd-4b43-8ef2-79dbfd73d5e9',
  'e493b1c1-af0d-4b33-835f-31bff4378393',
  'fda08930-ec16-4215-aa84-daf03b478583'
];

async function analyzeEvents() {
  try {
    console.log('Fetching events...\n');

    const events = await Promise.all(
      eventIds.map(id => prisma.event.findUnique({
        where: { id },
        include: {
          venue: true,
          sources: true,
        },
      }))
    );

    // Display all events
    events.forEach((event, idx) => {
      if (!event) {
        console.log(`Event ${eventIds[idx]} not found\n`);
        return;
      }

      console.log('='.repeat(80));
      console.log(`[${idx + 1}] ${event.title}`);
      console.log('='.repeat(80));
      console.log(`ID: ${event.id}`);
      console.log(`Normalized: ${event.normalizedTitle}`);
      console.log(`Venue: ${event.venue.name} (${event.venueId})`);
      console.log(`Start: ${event.startDateTime.toLocaleString()}`);
      console.log(`End: ${event.endDateTime?.toLocaleString() || 'N/A'}`);
      console.log(`Category: ${event.category.join(', ')}`);
      console.log(`Tags: ${event.tags.join(', ')}`);
      console.log(`Is Recurring: ${event.isRecurring}`);
      console.log(`Sources: ${event.sources.map(s => s.sourceName).join(', ')}`);
      console.log(`Created: ${event.createdAt.toLocaleString()}`);
      console.log();
    });

    // Analyze patterns
    console.log('='.repeat(80));
    console.log('PATTERN ANALYSIS');
    console.log('='.repeat(80));

    const validEvents = events.filter(e => e !== null);

    if (validEvents.length < 2) {
      console.log('Not enough events to analyze');
      return;
    }

    // Check if same venue
    const venues = new Set(validEvents.map(e => e!.venueId));
    console.log(`\nUnique venues: ${venues.size}`);
    if (venues.size === 1) {
      console.log(`  ✓ All events at: ${validEvents[0]!.venue.name}`);
    } else {
      console.log(`  Multiple venues - may not be recurring series`);
    }

    // Check title similarity
    const titles = validEvents.map(e => e!.normalizedTitle);
    const uniqueTitles = new Set(titles);
    console.log(`\nUnique normalized titles: ${uniqueTitles.size}`);
    if (uniqueTitles.size === 1) {
      console.log(`  ✓ All events have identical title: "${validEvents[0]!.title}"`);
    } else {
      console.log(`  Titles vary:`);
      uniqueTitles.forEach(title => console.log(`    - ${title}`));
    }

    // Check date pattern
    const dates = validEvents.map(e => e!.startDateTime).sort((a, b) => a.getTime() - b.getTime());
    console.log(`\nDates (sorted):`);
    dates.forEach((date, idx) => {
      console.log(`  ${idx + 1}. ${date.toLocaleDateString()} (${date.toLocaleDateString('en-US', { weekday: 'long' })})`);
    });

    // Calculate intervals
    if (dates.length >= 2) {
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        const daysDiff = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
        intervals.push(Math.round(daysDiff));
      }
      console.log(`\nDay intervals between events: ${intervals.join(', ')}`);

      const allSame = intervals.every(i => i === intervals[0]);
      if (allSame) {
        console.log(`  ✓ Regular pattern: Every ${intervals[0]} day(s)`);
      }
    }

    // Conclusion
    console.log('\n' + '='.repeat(80));
    console.log('CONCLUSION');
    console.log('='.repeat(80));

    const sameVenue = venues.size === 1;
    const sameTitle = uniqueTitles.size === 1;

    if (sameVenue && sameTitle) {
      console.log('✓ These appear to be RECURRING instances of the same event');
      console.log('  - Same venue');
      console.log('  - Same title');
      console.log('  - Multiple dates');
      console.log('\nRecommendation: These should be either:');
      console.log('  1. Marked as isRecurring=true, OR');
      console.log('  2. Deduplicated into a single recurring event series');
    } else {
      console.log('⚠ These events have some variation - review manually');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

analyzeEvents();
