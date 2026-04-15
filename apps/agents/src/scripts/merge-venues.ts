#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Merge duplicate venues by moving all events and data to canonical venue
 */
async function mergeVenues(canonicalId: string, duplicateId: string, confirm: boolean = false) {
  try {
    // Fetch both venues
    const [canonical, duplicate] = await Promise.all([
      prisma.venue.findUnique({
        where: { id: canonicalId },
        include: {
          events: { where: { status: 'ACTIVE' } },
          _count: { select: { events: true } }
        }
      }),
      prisma.venue.findUnique({
        where: { id: duplicateId },
        include: {
          events: { where: { status: 'ACTIVE' } },
          _count: { select: { events: true } }
        }
      })
    ]);

    if (!canonical || !duplicate) {
      console.log('One or both venues not found');
      return;
    }

    console.log('='.repeat(80));
    console.log('VENUE MERGE PREVIEW');
    console.log('='.repeat(80));

    console.log('\nCANONICAL VENUE (will be kept):');
    console.log(`  Name: ${canonical.name}`);
    console.log(`  ID: ${canonical.id}`);
    console.log(`  Address: ${canonical.address || 'N/A'}`);
    console.log(`  City: ${canonical.city || 'N/A'}`);
    console.log(`  Coordinates: ${canonical.latitude && canonical.longitude ? `${canonical.latitude}, ${canonical.longitude}` : 'N/A'}`);
    console.log(`  Active Events: ${canonical.events.length}`);

    console.log('\nDUPLICATE VENUE (will be merged into canonical):');
    console.log(`  Name: ${duplicate.name}`);
    console.log(`  ID: ${duplicate.id}`);
    console.log(`  Address: ${duplicate.address || 'N/A'}`);
    console.log(`  City: ${duplicate.city || 'N/A'}`);
    console.log(`  Coordinates: ${duplicate.latitude && duplicate.longitude ? `${duplicate.latitude}, ${duplicate.longitude}` : 'N/A'}`);
    console.log(`  Active Events: ${duplicate.events.length}`);

    console.log('\nACTIONS:');
    console.log(`  • Move ${duplicate.events.length} events from duplicate to canonical`);
    console.log(`  • Update venue references`);
    console.log(`  • Soft-delete duplicate venue (mark as MERGED)`);

    if (duplicate.events.length > 0) {
      console.log('\nEvents that will be moved:');
      duplicate.events.slice(0, 10).forEach((e, idx) => {
        console.log(`  [${idx + 1}] ${e.title} - ${e.startDateTime.toLocaleDateString()}`);
      });
      if (duplicate.events.length > 10) {
        console.log(`  ... and ${duplicate.events.length - 10} more events`);
      }
    }

    if (!confirm) {
      console.log('\n' + '='.repeat(80));
      console.log('⚠️  DRY RUN MODE - No changes made');
      console.log('='.repeat(80));
      console.log('\nTo MERGE these venues, run:');
      console.log(`  npx tsx src/scripts/merge-venues.ts "${canonicalId}" "${duplicateId}" --confirm`);
      return;
    }

    // Perform merge in transaction
    console.log('\n' + '='.repeat(80));
    console.log(`⚠️  MERGING VENUES`);
    console.log('='.repeat(80));

    const result = await prisma.$transaction(async (tx) => {
      // Move all events to canonical venue
      const movedEvents = await tx.event.updateMany({
        where: { venueId: duplicateId },
        data: { venueId: canonicalId }
      });

      // Merge venue metadata (take best data from both)
      const mergedData = {
        address: canonical.address || duplicate.address,
        city: canonical.city || duplicate.city,
        state: canonical.state || duplicate.state,
        zipCode: canonical.zipCode || duplicate.zipCode,
        latitude: canonical.latitude || duplicate.latitude,
        longitude: canonical.longitude || duplicate.longitude,
        website: canonical.website || duplicate.website,
        phone: canonical.phone || duplicate.phone,
        metadata: {
          ...(canonical.metadata as any || {}),
          mergedFrom: duplicate.id,
          mergedFromName: duplicate.name,
          mergedAt: new Date().toISOString(),
        },
      };

      // Update canonical venue with merged data
      await tx.venue.update({
        where: { id: canonicalId },
        data: mergedData
      });

      // Soft-delete duplicate venue
      await tx.venue.update({
        where: { id: duplicateId },
        data: {
          metadata: {
            ...(duplicate.metadata as any || {}),
            mergedInto: canonicalId,
            mergedAt: new Date().toISOString(),
            status: 'MERGED'
          }
        }
      });

      return {
        eventsMovedCount: movedEvents.count,
      };
    });

    console.log('\n✓ Merge completed successfully:');
    console.log(`  Events moved: ${result.eventsMovedCount}`);
    console.log(`  Canonical venue: ${canonical.name} (${canonicalId})`);
    console.log(`  Merged venue: ${duplicate.name} (${duplicateId})`);
    console.log('\n✓ All events from duplicate venue now point to canonical venue');

  } catch (error: any) {
    console.error('Error:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Parse command line arguments
const args = process.argv.slice(2);
const canonicalId = args[0];
const duplicateId = args[1];
const confirm = args.includes('--confirm') || args.includes('-c');

if (!canonicalId || !duplicateId || args.includes('--help') || args.includes('-h')) {
  console.log(`
Venue Merge Tool

Usage: npx tsx src/scripts/merge-venues.ts <canonical-id> <duplicate-id> [--confirm]

Arguments:
  canonical-id        UUID of venue to keep (all events will point here)
  duplicate-id        UUID of venue to merge (will be soft-deleted)

Options:
  --confirm, -c       Actually perform merge (default is dry run)
  --help, -h          Show this help message

Example:
  # Dry run - preview what will happen
  npx tsx src/scripts/merge-venues.ts "uuid1" "uuid2"

  # Actually merge
  npx tsx src/scripts/merge-venues.ts "uuid1" "uuid2" --confirm

Tip: Run find-duplicate-venues.ts first to discover duplicates
`);
  process.exit(canonicalId && duplicateId ? 0 : 1);
}

console.log('Venue Merge Tool');
console.log('Mode:', confirm ? '⚠️  MERGE' : 'DRY RUN');
console.log();

mergeVenues(canonicalId, duplicateId, confirm)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
