#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Mark events as recurring based on keywords in title or tags
 * Useful for weekly events like "Taco Tuesday", "Trivia Night", etc.
 */
async function markRecurringByKeywords(autoMark: boolean = false) {
  try {
    console.log('Finding events with recurring keywords...\n');

    // Strong recurring patterns - these are more specific and less likely to be false positives
    const strongPatterns = [
      'trivia night',
      'quiz night',
      'open mic',
      'open mike',
      'happy hour',
      'industry night',
      'taco tuesday',
      'pizza monday',
      'wing wednesday',
      'every monday',
      'every tuesday',
      'every wednesday',
      'every thursday',
      'every friday',
      'every saturday',
      'every sunday',
      'weekly trivia',
      'weekly bingo',
    ];

    // Event brands to exclude (these contain keywords but are one-time events)
    const excludedBrands = [
      'bingo loco',        // Interactive bingo party brand
      'is it friday yet',  // Comedy tour name
      'friday night lights', // Could be a show/movie screening
    ];

    // Tags that strongly suggest recurring
    const recurringTags = [
      'weekly', 'weekly event', 'weekly special',
      'daily',
      'recurring',
    ];

    // Find events with strong recurring patterns that aren't marked as recurring
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        isRecurring: false,
        OR: [
          // Check strong patterns (case insensitive)
          ...strongPatterns.map(pattern => ({
            title: {
              contains: pattern,
              mode: 'insensitive' as const,
            },
          })),
          // Check tags
          ...recurringTags.map(tag => ({
            tags: {
              has: tag,
            },
          })),
        ],
      },
      include: {
        venue: true,
      },
      orderBy: {
        venue: {
          name: 'asc',
        },
      },
    });

    // Filter out excluded brands
    const filteredEvents = events.filter(event => {
      const lowerTitle = event.title.toLowerCase();
      return !excludedBrands.some(brand => lowerTitle.includes(brand));
    });

    console.log(`Found ${filteredEvents.length} events with recurring patterns (${events.length - filteredEvents.length} excluded as one-time events):\n`);

    if (filteredEvents.length === 0) {
      console.log('No recurring events found');
      return;
    }

    // Group by venue for better display
    const byVenue = new Map<string, typeof filteredEvents>();
    for (const event of filteredEvents) {
      const existing = byVenue.get(event.venue.name) || [];
      existing.push(event);
      byVenue.set(event.venue.name, existing);
    }

    for (const [venueName, venueEvents] of byVenue) {
      console.log('='.repeat(80));
      console.log(`Venue: ${venueName}`);
      console.log('='.repeat(80));

      venueEvents.forEach((event, idx) => {
        const matchedKeywords = [];

        // Check which patterns matched
        for (const pattern of strongPatterns) {
          if (event.title.toLowerCase().includes(pattern)) {
            matchedKeywords.push(`title:"${pattern}"`);
          }
        }
        for (const tag of recurringTags) {
          if (event.tags.includes(tag)) {
            matchedKeywords.push(`tag:"${tag}"`);
          }
        }

        console.log(`\n  [${idx + 1}] ${event.title}`);
        console.log(`      ID: ${event.id}`);
        console.log(`      Date: ${event.startDateTime.toLocaleDateString()}`);
        console.log(`      Matched: ${matchedKeywords.join(', ')}`);
        console.log(`      Tags: ${event.tags.join(', ')}`);
      });
      console.log();
    }

    // Summary and actions
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total events with recurring patterns: ${filteredEvents.length}`);
    if (events.length > filteredEvents.length) {
      console.log(`Excluded one-time events: ${events.length - filteredEvents.length}`);
    }

    if (autoMark) {
      console.log(`\n>>> Marking ${filteredEvents.length} events as recurring...`);

      const result = await prisma.event.updateMany({
        where: {
          id: { in: filteredEvents.map(e => e.id) },
        },
        data: {
          isRecurring: true,
          recurringPattern: {
            detectedBy: 'keywords',
            detectedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`✓ Marked ${result.count} events as recurring`);
    } else {
      console.log('\n💡 To mark these events as recurring, run:');
      console.log('   pnpm --filter @slo-events/agents mark-recurring-keywords');
    }

  } catch (error: any) {
    console.error('Error:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const autoMark = args.includes('--auto-mark') || args.includes('-m');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Recurring Event Keyword Marker

Usage: pnpm --filter @slo-events/agents [command]

Commands:
  find-recurring-keywords      Find events with recurring keywords (dry run)
  mark-recurring-keywords      Mark events with recurring keywords as recurring

Examples:
  # Find events with recurring keywords
  pnpm --filter @slo-events/agents find-recurring-keywords

  # Mark them as recurring
  pnpm --filter @slo-events/agents mark-recurring-keywords
`);
  process.exit(0);
}

console.log('Recurring Event Keyword Detection');
console.log('Mode:', autoMark ? 'AUTO-MARK' : 'DRY RUN (find only)');
console.log();

markRecurringByKeywords(autoMark)
  .then(() => {
    console.log('\n✓ Completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
