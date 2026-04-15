#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Detect recurring event patterns and mark them as isRecurring=true
 * Looks for events with similar titles at the same venue on regular intervals
 */
async function detectRecurringEvents(autoMark: boolean = false) {
  try {
    console.log('Detecting recurring event patterns...\n');

    // Get all active events (past 90 days to future) grouped by venue
    const venues = await prisma.venue.findMany({
      where: {
        events: {
          some: {
            status: 'ACTIVE',
            startDateTime: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
          },
        },
      },
      include: {
        events: {
          where: {
            status: 'ACTIVE',
            startDateTime: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: {
            startDateTime: 'asc',
          },
        },
      },
    });

    let totalRecurringPatterns = 0;
    let totalEventsMarked = 0;

    for (const venue of venues) {
      if (venue.events.length < 2) continue;

      // Group events by normalized title core words
      const eventGroups = new Map<string, typeof venue.events>();

      for (const event of venue.events) {
        // Extract core words (remove common words)
        const stopWords = new Set(['at', 'the', 'and', 'with', 'live', 'night', 'show', 'event', 'concert', 'series', 'music']);
        const coreWords = event.normalizedTitle
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.has(w))
          .slice(0, 4)
          .join(' ');

        if (!coreWords) continue;

        const existing = eventGroups.get(coreWords) || [];
        existing.push(event);
        eventGroups.set(coreWords, existing);
      }

      // Check each group for recurring patterns
      for (const [coreWords, events] of eventGroups.entries()) {
        if (events.length < 2) continue; // Need at least 2 occurrences to suggest pattern

        // Sort by date
        events.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

        // Calculate intervals between events
        const intervals = [];
        for (let i = 1; i < events.length; i++) {
          const daysDiff = Math.round(
            (events[i].startDateTime.getTime() - events[i-1].startDateTime.getTime()) / (1000 * 60 * 60 * 24)
          );
          intervals.push(daysDiff);
        }

        // Check if there's a regular pattern
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const isRegular = intervals.every(i => Math.abs(i - avgInterval) <= 2); // Within 2 days tolerance

        // Also check if title has recurring keywords
        const recurringKeywords = /monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekly|daily|trivia|bingo|open mic|happy hour|taco/i;
        const hasRecurringKeywords = events.some(e => recurringKeywords.test(e.title));

        // Consider it recurring if: regular pattern OR has recurring keywords with 2+ events
        const isRecurringPattern = (isRegular && (avgInterval === 7 || avgInterval === 14 || avgInterval === 1)) ||
                                    (hasRecurringKeywords && events.length >= 2);

        if (isRecurringPattern) {
          const detectionMethod = hasRecurringKeywords ? '[KEYWORDS]' : '[PATTERN]';

          console.log('='.repeat(80));
          console.log(`RECURRING PATTERN DETECTED ${detectionMethod}`);
          console.log('='.repeat(80));
          console.log(`Venue: ${venue.name}`);
          if (isRegular && avgInterval) {
            console.log(`Pattern: Every ${avgInterval} day(s)`);
          }
          console.log(`Events in series: ${events.length}`);
          console.log(`Core words: "${coreWords}"`);
          console.log();

          events.forEach((e, idx) => {
            console.log(`  [${idx + 1}] ${e.title}`);
            console.log(`      ID: ${e.id}`);
            console.log(`      Date: ${e.startDateTime.toLocaleDateString()} (${e.startDateTime.toLocaleDateString('en-US', { weekday: 'long' })})`);
            console.log(`      Is Recurring: ${e.isRecurring}`);
          });

          totalRecurringPatterns++;

          // Mark as recurring if requested
          if (autoMark) {
            console.log(`\n  >>> Marking ${events.length} events as recurring...`);

            const eventIds = events.map(e => e.id);
            const result = await prisma.event.updateMany({
              where: {
                id: { in: eventIds },
              },
              data: {
                isRecurring: true,
                recurringPattern: {
                  interval: avgInterval,
                  unit: 'days',
                  detectedAt: new Date().toISOString(),
                },
              },
            });

            console.log(`  ✓ Marked ${result.count} events as recurring`);
            totalEventsMarked += result.count;
          }

          console.log();
        }
      }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Recurring patterns found: ${totalRecurringPatterns}`);
    if (autoMark) {
      console.log(`Events marked as recurring: ${totalEventsMarked}`);
    } else {
      console.log('\n💡 To automatically mark these events as recurring, run:');
      console.log('   pnpm --filter @slo-events/agents mark-recurring');
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
Recurring Event Detection Tool

Usage: pnpm --filter @slo-events/agents [command]

Commands:
  find-recurring      Detect recurring event patterns (dry run)
  mark-recurring      Detect and mark events as recurring

Options:
  --auto-mark, -m     Automatically mark events as recurring
  --help, -h          Show this help message

Examples:
  # Find recurring patterns (dry run)
  pnpm --filter @slo-events/agents find-recurring

  # Find and mark as recurring
  pnpm --filter @slo-events/agents mark-recurring
`);
  process.exit(0);
}

console.log('Recurring Event Detection Tool');
console.log('Mode:', autoMark ? 'AUTO-MARK' : 'DRY RUN (detect only)');
console.log();

detectRecurringEvents(autoMark)
  .then(() => {
    console.log('\n✓ Detection completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Detection failed:', error.message);
    process.exit(1);
  });
