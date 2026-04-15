#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';
import { logger } from '../lib/scraper-utils';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Find and display duplicate events using improved criteria
 * (same venue, same date, similar title)
 */
async function findDuplicates(autoMerge: boolean = false) {
  try {
    logger.info('Starting duplicate detection...');

    // Get all active upcoming events
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        startDateTime: {
          gte: new Date(),
        },
      },
      include: {
        venue: true,
        sources: true,
      },
      orderBy: {
        startDateTime: 'asc',
      },
    });

    logger.info(`Found ${events.length} active upcoming events to check`);

    const duplicateGroups: Map<string, typeof events> = new Map();
    const processed = new Set<string>();

    for (const event of events) {
      if (processed.has(event.id)) continue;

      // Find potential duplicates using same criteria as deduplicator
      // Check 1: Exact time match (within 1 minute) at same venue
      // Check 2: Cross-venue match (identical title, same time, nearby location)
      // Check 3: Core words match (same venue, same date, shared core words)
      // Check 4: Fuzzy title match (same venue, same date, 70%+ title similarity)
      const potentialDuplicates = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        normalized_title: string;
        similarity: number;
        start_datetime: Date;
        match_type: string;
        venue_name: string;
        distance_meters: number | null;
      }>>`
        SELECT e.id, e.title, e.normalized_title,
               similarity(e.normalized_title, ${event.normalizedTitle}) as similarity,
               e.start_datetime,
               v.name as venue_name,
               CASE
                 WHEN v1.latitude IS NOT NULL AND v1.longitude IS NOT NULL
                   AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
                 THEN (
                   6371000 * acos(
                     cos(radians(v1.latitude)) * cos(radians(v.latitude)) *
                     cos(radians(v.longitude) - radians(v1.longitude)) +
                     sin(radians(v1.latitude)) * sin(radians(v.latitude))
                   )
                 )
                 ELSE NULL
               END as distance_meters,
               CASE
                 WHEN e.venue_id = ${event.venueId}::uuid
                   AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
                 THEN 'exact_time'
                 WHEN e.venue_id != ${event.venueId}::uuid
                   AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.95
                   AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
                   AND CASE
                     WHEN v1.latitude IS NOT NULL AND v.longitude IS NOT NULL
                       AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
                     THEN (
                       6371000 * acos(
                         LEAST(1.0, GREATEST(-1.0,
                           cos(radians(v1.latitude)) * cos(radians(v.latitude)) *
                           cos(radians(v.longitude) - radians(v1.longitude)) +
                           sin(radians(v1.latitude)) * sin(radians(v.latitude))
                         ))
                       )
                     ) < 100
                     ELSE false
                   END
                 THEN 'cross_venue'
                 ELSE 'fuzzy_title'
               END as match_type
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        JOIN venues v1 ON v1.id = ${event.venueId}::uuid
        WHERE e.id != ${event.id}::uuid
        AND e.status = 'ACTIVE'
        AND (
          -- Same venue: Exact time match (within 1 minute)
          (e.venue_id = ${event.venueId}::uuid
           AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1)
          OR
          -- Cross-venue: Identical title, same time, nearby location (within 100m)
          (e.venue_id != ${event.venueId}::uuid
           AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.95
           AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
           AND CASE
             WHEN v1.latitude IS NOT NULL AND v1.longitude IS NOT NULL
               AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
             THEN (
               6371000 * acos(
                 LEAST(1.0, GREATEST(-1.0,
                   cos(radians(v1.latitude)) * cos(radians(v.latitude)) *
                   cos(radians(v.longitude) - radians(v1.longitude)) +
                   sin(radians(v1.latitude)) * sin(radians(v.latitude))
                 ))
               )
             ) < 100
             ELSE false
           END)
          OR
          -- Same venue: Fuzzy title match (within 6 hours, similar title)
          (e.venue_id = ${event.venueId}::uuid
           AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 3600) < 6
           AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.7)
        )
        ORDER BY
          CASE
            WHEN e.venue_id = ${event.venueId}::uuid
              AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
            THEN 0
            WHEN e.venue_id != ${event.venueId}::uuid
              AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.95
              AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
            THEN 1
            ELSE 2
          END,
          similarity DESC
      `;

      // Additional check: Core words match - same venue + same date + time proximity + core words
      // Requires times within 8 hours to avoid matching recurring events (e.g., "Santa Visits" on Dec 5 vs Dec 6)
      const stopWords = new Set(['at', 'the', 'and', 'with', 'live', 'night', 'show', 'event', 'concert', 'series', 'music', 'free', 'afternoon', 'evening', 'morning']);
      const coreWords = event.normalizedTitle
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
        .slice(0, 3);

      if (coreWords.length >= 2) {
        const coreWordPattern = coreWords.join('.*');

        const coreWordMatches = await prisma.$queryRaw<Array<{
          id: string;
          title: string;
          normalized_title: string;
          start_datetime: Date;
        }>>`
          SELECT id, title, normalized_title, start_datetime
          FROM events
          WHERE id != ${event.id}::uuid
          AND venue_id = ${event.venueId}::uuid
          AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) <= 8
          AND normalized_title ~ ${coreWordPattern}
          AND status = 'ACTIVE'
        `;

        for (const match of coreWordMatches) {
          if (!processed.has(match.id)) {
            potentialDuplicates.push({
              id: match.id,
              title: match.title,
              normalized_title: match.normalized_title,
              similarity: 0.9,
              start_datetime: match.start_datetime,
              match_type: 'core_words',
              venue_name: event.venue.name,
              distance_meters: null,
            });
          }
        }
      }

      if (potentialDuplicates.length > 0) {
        const groupKey = event.id;
        const group = [event];

        for (const dup of potentialDuplicates) {
          const fullDup = events.find(e => e.id === dup.id);
          if (fullDup) {
            group.push(fullDup);
            processed.add(dup.id);
          }
        }

        duplicateGroups.set(groupKey, group);
        processed.add(event.id);

        // Display duplicate group
        console.log('\n' + '='.repeat(80));
        console.log(`DUPLICATE GROUP (${group.length} events)`);
        console.log('='.repeat(80));

        group.forEach((e, idx) => {
          const dup = potentialDuplicates.find(d => d.id === e.id);
          let matchType = '';
          if (dup?.match_type === 'exact_time') {
            matchType = '[EXACT TIME]';
          } else if (dup?.match_type === 'cross_venue') {
            matchType = '[CROSS-VENUE]';
          } else if (dup?.match_type === 'core_words') {
            matchType = '[CORE WORDS - SAME DAY/VENUE]';
          } else if (dup?.match_type === 'fuzzy_title') {
            matchType = '[FUZZY TITLE]';
          }

          console.log(`\n[${idx + 1}] ${e.title} ${idx > 0 ? matchType : ''}`);
          console.log(`    ID: ${e.id}`);
          console.log(`    Venue: ${e.venue.name}`);
          console.log(`    Date: ${e.startDateTime.toLocaleString()}`);
          console.log(`    Sources: ${e.sources.map(s => s.sourceName).join(', ')}`);
          console.log(`    Created: ${e.createdAt.toLocaleString()}`);
          if (dup && idx > 0) {
            console.log(`    Match confidence: ${(dup.similarity * 100).toFixed(0)}% title similarity`);
            if (dup.match_type === 'cross_venue' && dup.distance_meters !== null) {
              console.log(`    Distance: ${dup.distance_meters.toFixed(0)}m away`);
            }
          }
        });

        // Auto-merge if requested
        if (autoMerge && group.length > 1) {
          const canonical = group[0]; // Keep the first one (oldest)
          const duplicates = group.slice(1);

          console.log(`\n>>> Auto-merging ${duplicates.length} duplicate(s) into ${canonical.id}`);

          for (const duplicate of duplicates) {
            try {
              await prisma.$transaction(async (tx) => {
                // Get sources for both events
                const [canonicalSources, duplicateSources] = await Promise.all([
                  tx.eventSource.findMany({
                    where: { eventId: canonical.id },
                    select: { sourceUrl: true },
                  }),
                  tx.eventSource.findMany({
                    where: { eventId: duplicate.id },
                  }),
                ]);

                const canonicalSourceUrls = new Set(canonicalSources.map(s => s.sourceUrl));

                // Move or delete sources based on whether canonical already has them
                for (const source of duplicateSources) {
                  if (canonicalSourceUrls.has(source.sourceUrl)) {
                    // Canonical already has this source, delete duplicate's version
                    await tx.eventSource.delete({
                      where: { id: source.id },
                    });
                  } else {
                    // Move source to canonical event
                    await tx.eventSource.update({
                      where: { id: source.id },
                      data: { eventId: canonical.id },
                    });
                  }
                }

                // Move user interactions
                await tx.userEventInteraction.updateMany({
                  where: { eventId: duplicate.id },
                  data: { eventId: canonical.id },
                });

                // Record duplicate relationship
                await tx.eventDuplicate.upsert({
                  where: {
                    canonicalEventId_duplicateEventId: {
                      canonicalEventId: canonical.id,
                      duplicateEventId: duplicate.id,
                    },
                  },
                  create: {
                    canonicalEventId: canonical.id,
                    duplicateEventId: duplicate.id,
                    similarityScore: 1.0,
                  },
                  update: {
                    mergedAt: new Date(),
                  },
                });

                // Mark duplicate as merged
                await tx.event.update({
                  where: { id: duplicate.id },
                  data: { status: 'MERGED' },
                });
              });

              console.log(`    ✓ Merged ${duplicate.id}`);
            } catch (error: any) {
              console.error(`    ✗ Failed to merge ${duplicate.id}: ${error.message}`);
            }
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total events checked: ${events.length}`);
    console.log(`Duplicate groups found: ${duplicateGroups.size}`);

    const totalDuplicates = Array.from(duplicateGroups.values())
      .reduce((sum, group) => sum + group.length, 0);
    console.log(`Total events in duplicate groups: ${totalDuplicates}`);

    if (!autoMerge && duplicateGroups.size > 0) {
      console.log('\n💡 To automatically merge duplicates, run:');
      console.log('   pnpm --filter @slo-events/agents merge-dupes');
    }

  } catch (error: any) {
    logger.error('Deduplication failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const autoMerge = args.includes('--auto-merge') || args.includes('-m');
const dryRun = args.includes('--dry-run') || args.includes('-d');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Event Deduplication Tool

Usage: pnpm --filter @slo-events/agents [command]

Commands:
  find-dupes          Find duplicate events (dry run, no changes)
  merge-dupes         Find and automatically merge duplicate events

Options:
  --auto-merge, -m    Automatically merge duplicate events
  --dry-run, -d       Find duplicates without merging (default)
  --help, -h          Show this help message

Examples:
  # Find duplicates (dry run)
  pnpm --filter @slo-events/agents find-dupes

  # Find and auto-merge duplicates
  pnpm --filter @slo-events/agents merge-dupes
`);
  process.exit(0);
}

// Run
console.log('Event Deduplication Tool');
console.log('Mode:', autoMerge ? 'AUTO-MERGE' : 'DRY RUN (find only)');
console.log();

findDuplicates(autoMerge)
  .then(() => {
    console.log('\n✓ Deduplication completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Deduplication failed:', error.message);
    process.exit(1);
  });
