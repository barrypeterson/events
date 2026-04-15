#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Find duplicate venues based on:
 * 1. Same address
 * 2. Same coordinates (within 50 meters)
 * 3. Similar names at same location
 */
async function findDuplicateVenues() {
  try {
    console.log('Finding duplicate venues...\n');

    const venues = await prisma.venue.findMany({
      include: {
        _count: {
          select: { events: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log(`Checking ${venues.length} venues for duplicates...\n`);

    const duplicateGroups: Map<string, typeof venues> = new Map();
    const processed = new Set<string>();

    for (const venue of venues) {
      if (processed.has(venue.id)) continue;

      const duplicates = venues.filter(v => {
        if (v.id === venue.id || processed.has(v.id)) return false;

        // Check 1: Same address (exact match)
        if (venue.address && v.address && venue.address === v.address) {
          return true;
        }

        // Check 2: Same coordinates (within 50 meters)
        if (venue.latitude && venue.longitude && v.latitude && v.longitude) {
          const distance = calculateDistance(
            venue.latitude,
            venue.longitude,
            v.latitude,
            v.longitude
          );

          if (distance < 50) {
            return true;
          }
        }

        return false;
      });

      if (duplicates.length > 0) {
        const group = [venue, ...duplicates];
        duplicateGroups.set(venue.id, group);

        // Mark all in group as processed
        group.forEach(v => processed.add(v.id));
      }
    }

    // Display duplicate groups
    if (duplicateGroups.size === 0) {
      console.log('✓ No duplicate venues found');
      return;
    }

    console.log(`Found ${duplicateGroups.size} duplicate venue groups:\n`);

    let groupNum = 0;
    for (const [canonicalId, group] of duplicateGroups) {
      groupNum++;
      console.log('='.repeat(80));
      console.log(`GROUP ${groupNum} (${group.length} venues)`);
      console.log('='.repeat(80));

      // Calculate distances and similarity
      const canonical = group[0];

      group.forEach((venue, idx) => {
        const isCanonical = idx === 0;
        let matchReason = '';

        if (!isCanonical) {
          // Determine why it matched
          if (canonical.address && venue.address && canonical.address === venue.address) {
            matchReason = '[SAME ADDRESS]';
          } else if (canonical.latitude && canonical.longitude && venue.latitude && venue.longitude) {
            const distance = calculateDistance(
              canonical.latitude,
              canonical.longitude,
              venue.latitude,
              venue.longitude
            );
            matchReason = `[SAME LOCATION - ${distance.toFixed(0)}m]`;
          }
        }

        console.log(`\n[${idx + 1}] ${venue.name} ${matchReason}`);
        console.log(`    ID: ${venue.id}`);
        console.log(`    Address: ${venue.address || 'N/A'}`);
        console.log(`    City: ${venue.city || 'N/A'}`);
        console.log(`    Coordinates: ${venue.latitude && venue.longitude ? `${venue.latitude}, ${venue.longitude}` : 'N/A'}`);
        console.log(`    Events: ${venue._count.events}`);
        console.log(`    Normalized: ${venue.normalizedName || 'N/A'}`);
        console.log(`    Created: ${venue.createdAt.toLocaleDateString()}`);

        if (isCanonical) {
          console.log(`    >>> KEEP THIS ONE (canonical) <<<`);
        }
      });

      console.log();
    }

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duplicate groups found: ${duplicateGroups.size}`);

    const totalDuplicates = Array.from(duplicateGroups.values())
      .reduce((sum, group) => sum + group.length - 1, 0);
    console.log(`Duplicate venues to merge: ${totalDuplicates}`);

    const totalEvents = Array.from(duplicateGroups.values())
      .reduce((sum, group) => sum + group.reduce((s, v) => s + v._count.events, 0), 0);
    console.log(`Total events in these venues: ${totalEvents}`);

    console.log('\n💡 To merge duplicate venues, use:');
    console.log('   npx tsx src/scripts/merge-venues.ts <canonical-id> <duplicate-id> --confirm');
    console.log('\nRecommendation: Keep the venue with the most events or most accurate info');

  } catch (error: any) {
    console.error('Error:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
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

console.log('Venue Deduplication Detector\n');

findDuplicateVenues()
  .then(() => {
    console.log('\n✓ Detection completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
