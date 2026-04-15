#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Delete all events for a specific venue
 * Useful for cleaning up before re-scraping
 */
async function deleteVenueEvents(venueName: string, confirm: boolean = false) {
  try {
    // Find the venue
    const venue = await prisma.venue.findFirst({
      where: {
        name: {
          contains: venueName,
          mode: 'insensitive'
        }
      },
      include: {
        events: {
          where: {
            status: 'ACTIVE'
          }
        }
      }
    });

    if (!venue) {
      console.log(`No venue found matching: "${venueName}"`);
      console.log('\nTip: Try searching for a partial name (e.g., "Mulligan" instead of "Mulligan\'s Bar & Grill")');
      return;
    }

    console.log('='.repeat(80));
    console.log(`Venue: ${venue.name}`);
    console.log('='.repeat(80));
    console.log(`ID: ${venue.id}`);
    console.log(`Active events: ${venue.events.length}`);
    console.log();

    if (venue.events.length === 0) {
      console.log('No active events to delete');
      return;
    }

    // Show events that will be deleted
    console.log('Events that will be deleted:');
    venue.events.forEach((e, idx) => {
      console.log(`  [${idx + 1}] ${e.title}`);
      console.log(`      Date: ${e.startDateTime.toLocaleDateString()}`);
      console.log(`      ID: ${e.id}`);
    });
    console.log();

    if (!confirm) {
      console.log('='.repeat(80));
      console.log('⚠️  DRY RUN MODE - No changes made');
      console.log('='.repeat(80));
      console.log(`\nTo DELETE these ${venue.events.length} events, run:`);
      console.log(`  pnpm --filter @slo-events/agents delete-venue-events "${venue.name}" --confirm`);
      console.log('\nOr use the venue ID:');
      console.log(`  pnpm --filter @slo-events/agents tsx src/scripts/delete-venue-events.ts "${venue.id}" --confirm`);
      return;
    }

    // Confirm deletion
    console.log('='.repeat(80));
    console.log(`⚠️  DELETING ${venue.events.length} events from ${venue.name}`);
    console.log('='.repeat(80));

    // Delete in transaction
    const result = await prisma.$transaction(async (tx) => {
      const eventIds = venue.events.map(e => e.id);

      // Delete event sources
      const deletedSources = await tx.eventSource.deleteMany({
        where: {
          eventId: { in: eventIds }
        }
      });

      // Delete user interactions
      const deletedInteractions = await tx.userEventInteraction.deleteMany({
        where: {
          eventId: { in: eventIds }
        }
      });

      // Delete duplicate relationships
      const deletedDuplicates = await tx.eventDuplicate.deleteMany({
        where: {
          OR: [
            { canonicalEventId: { in: eventIds } },
            { duplicateEventId: { in: eventIds } }
          ]
        }
      });

      // Delete events
      const deletedEvents = await tx.event.deleteMany({
        where: {
          id: { in: eventIds }
        }
      });

      return {
        events: deletedEvents.count,
        sources: deletedSources.count,
        interactions: deletedInteractions.count,
        duplicates: deletedDuplicates.count,
      };
    });

    console.log('\n✓ Deletion completed:');
    console.log(`  Events: ${result.events}`);
    console.log(`  Sources: ${result.sources}`);
    console.log(`  User interactions: ${result.interactions}`);
    console.log(`  Duplicate relationships: ${result.duplicates}`);
    console.log();
    console.log(`✓ All events from ${venue.name} have been deleted`);
    console.log('\nYou can now re-scrape to get fresh data:');
    console.log(`  pnpm --filter @slo-events/agents scrape:mulligans`);

  } catch (error: any) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const venueName = args[0];
const confirm = args.includes('--confirm') || args.includes('-c');

if (!venueName || args.includes('--help') || args.includes('-h')) {
  console.log(`
Delete Venue Events

Usage: npx tsx src/scripts/delete-venue-events.ts <venue-name> [options]

Arguments:
  venue-name          Venue name or partial name to search for

Options:
  --confirm, -c       Actually delete (default is dry run)
  --help, -h          Show this help message

Examples:
  # Dry run - see what would be deleted
  npx tsx src/scripts/delete-venue-events.ts "Mulligan"

  # Actually delete
  npx tsx src/scripts/delete-venue-events.ts "Mulligan" --confirm

  # Delete by exact name
  npx tsx src/scripts/delete-venue-events.ts "Mulligan's Bar & Grill" --confirm
`);
  process.exit(venueName ? 0 : 1);
}

console.log('Venue Events Deletion Tool');
console.log('Mode:', confirm ? '⚠️  DELETE' : 'DRY RUN');
console.log();

deleteVenueEvents(venueName, confirm)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
