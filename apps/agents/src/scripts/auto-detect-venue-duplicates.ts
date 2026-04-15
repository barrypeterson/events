#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';
import { findMatchingVenues } from '../lib/venue-utils';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Automatically detect and flag potential venue duplicates
 * This can be run on a schedule (e.g., nightly) to catch new duplicates
 */
async function autoDetectDuplicates(autoCreate: boolean = false) {
  try {
    console.log('='.repeat(80));
    console.log('AUTOMATED VENUE DUPLICATE DETECTION');
    console.log('='.repeat(80));
    console.log(`Mode: ${autoCreate ? 'AUTO-CREATE' : 'DRY RUN'}\n`);

    const venues = await prisma.venue.findMany({
      include: {
        _count: { select: { events: true } },
        duplicateOf: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Check last 100 venues
    });

    console.log(`Checking ${venues.length} recent venues for duplicates...\n`);

    let duplicatesFound = 0;
    let duplicatesCreated = 0;
    const processed = new Set<string>();

    for (const venue of venues) {
      // Skip if already marked as duplicate
      if (venue.duplicateOf.length > 0 || processed.has(venue.id)) continue;

      const matches = await findMatchingVenues({
        name: venue.name,
        address: venue.address || undefined,
        city: venue.city || undefined,
        latitude: venue.latitude ? Number(venue.latitude) : undefined,
        longitude: venue.longitude ? Number(venue.longitude) : undefined,
      });

      // Filter out the venue itself and exact matches (those are fine)
      const potentialDuplicates = matches.filter(
        (m) =>
          m.venue.id !== venue.id &&
          !processed.has(m.venue.id) &&
          m.matchReason !== 'exact'
      );

      if (potentialDuplicates.length > 0) {
        duplicatesFound++;

        console.log('-'.repeat(80));
        console.log(`[${duplicatesFound}] Potential Duplicate Detected`);
        console.log('-'.repeat(80));

        console.log(`\nNewer Venue (possible duplicate):`);
        console.log(`  Name: ${venue.name}`);
        console.log(`  ID: ${venue.id}`);
        console.log(`  Address: ${venue.address || 'N/A'}`);
        console.log(`  Events: ${venue._count.events}`);
        console.log(`  Created: ${venue.createdAt.toLocaleString()}`);

        console.log(`\nExisting Venue(s) (likely canonical):`);
        for (const match of potentialDuplicates) {
          console.log(`  - ${match.venue.name}`);
          console.log(`    ID: ${match.venue.id}`);
          console.log(`    Match Reason: ${match.matchReason}`);
          console.log(`    Similarity: ${(match.similarityScore * 100).toFixed(0)}%`);
          if (match.distance) {
            console.log(`    Distance: ${match.distance.toFixed(0)}m`);
          }
          console.log(`    Events: ${match.venue._count?.events || 0}`);
        }

        // Auto-create VenueDuplicate records if enabled
        if (autoCreate) {
          const canonical = potentialDuplicates[0].venue;

          try {
            await prisma.venueDuplicate.create({
              data: {
                canonicalVenueId: canonical.id,
                duplicateVenueId: venue.id,
                similarityScore: potentialDuplicates[0].similarityScore,
                matchReason: potentialDuplicates[0].matchReason,
                distance: potentialDuplicates[0].distance
                  ? Math.round(potentialDuplicates[0].distance)
                  : null,
                mergedBy: 'auto',
              },
            });

            duplicatesCreated++;
            console.log(`\n✓ Created VenueDuplicate record (canonical: ${canonical.name})`);
          } catch (error: any) {
            // Might already exist
            if (!error.message?.includes('unique constraint')) {
              console.log(`\n⚠️  Failed to create record: ${error.message}`);
            }
          }
        }

        console.log();
        processed.add(venue.id);
        potentialDuplicates.forEach((m) => processed.add(m.venue.id));
      }
    }

    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duplicates found: ${duplicatesFound}`);

    if (autoCreate) {
      console.log(`VenueDuplicate records created: ${duplicatesCreated}`);
      console.log('\n✓ Duplicate venues have been flagged in the database');
      console.log('  Admins can review and merge them via the admin dashboard');
    } else {
      console.log('\n💡 This was a dry run. To auto-create VenueDuplicate records, run:');
      console.log('   npx tsx src/scripts/auto-detect-venue-duplicates.ts --auto-create');
    }

    if (duplicatesFound > 0) {
      console.log('\n📋 Next steps:');
      console.log('   1. Review duplicates in the admin dashboard');
      console.log('   2. Merge confirmed duplicates');
      console.log('   3. Update scraper venue mappings if needed');
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
const autoCreate = args.includes('--auto-create') || args.includes('-c');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Automated Venue Duplicate Detection

Usage: npx tsx src/scripts/auto-detect-venue-duplicates.ts [--auto-create]

Options:
  --auto-create, -c   Automatically create VenueDuplicate records for detected duplicates
  --help, -h          Show this help message

This script checks recent venues for potential duplicates and flags them.
Can be run on a schedule (e.g., nightly cron job) to catch duplicates early.
`);
  process.exit(0);
}

autoDetectDuplicates(autoCreate)
  .then(() => {
    console.log('\n✓ Detection completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
