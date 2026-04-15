#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function testCrossVenueQuery() {
  try {
    // Get the newer event (Nov 7)
    const event = await prisma.event.findUnique({
      where: { id: 'c25e18c7-78f9-4121-bf21-7a9d56e25db5' }, // Newer Morgan Freeman event
      include: { venue: true },
    });

    if (!event) {
      console.log('Event not found');
      return;
    }

    console.log('Testing cross-venue query for:');
    console.log(`  Title: ${event.title}`);
    console.log(`  Normalized: ${event.normalizedTitle}`);
    console.log(`  Venue: ${event.venue.name} (${event.venueId})`);
    console.log(`  Start: ${event.startDateTime}`);
    console.log();

    // Run the exact cross-venue query from the deduplicator (with ALL filters)
    const crossVenueMatch = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      venue_name: string;
      venue_id: string;
      distance_meters: number;
      time_diff_minutes: number;
      title_similarity: number;
    }>>`
      SELECT e.id, e.title, v.name as venue_name, e.venue_id,
             CASE
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
               )
               ELSE 999999
             END as distance_meters,
             ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) as time_diff_minutes,
             similarity(e.normalized_title, ${event.normalizedTitle}) as title_similarity
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      JOIN venues v1 ON v1.id = ${event.venueId}::uuid
      WHERE e.venue_id != ${event.venueId}::uuid
      AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.95
      AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
      AND e.status = 'ACTIVE'
      AND (
        CASE
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
        END
      )
      ORDER BY distance_meters ASC, e.created_at ASC
      LIMIT 10
    `;

    console.log(`Found ${crossVenueMatch.length} events at different venues:\n`);

    crossVenueMatch.forEach((match, idx) => {
      console.log(`[${idx + 1}] ${match.title}`);
      console.log(`    ID: ${match.id}`);
      console.log(`    Venue: ${match.venue_name}`);
      console.log(`    Distance: ${match.distance_meters.toFixed(0)}m`);
      console.log(`    Time diff: ${match.time_diff_minutes.toFixed(0)} minutes`);
      console.log(`    Title similarity: ${(match.title_similarity * 100).toFixed(0)}%`);

      const meetsAllCriteria =
        match.title_similarity > 0.95 &&
        match.time_diff_minutes <= 1 &&
        match.distance_meters < 100;

      console.log(`    Would match: ${meetsAllCriteria ? '✓ YES' : '✗ NO'}`);
      if (!meetsAllCriteria) {
        if (match.title_similarity <= 0.95) console.log(`      - Title similarity too low (need >95%)`);
        if (match.time_diff_minutes > 1) console.log(`      - Time difference too large (need ≤1 min)`);
        if (match.distance_meters >= 100) console.log(`      - Distance too far (need <100m)`);
      }
      console.log();
    });

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

testCrossVenueQuery();
