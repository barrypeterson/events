#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function check() {
  try {
    const eventId1 = '7e6747de-4230-4afc-bf94-670c02d58efe'; // Free Afternoon
    const eventId2 = '433bca06-797a-4be1-a6ea-eab590315139'; // Dance Party

    const result = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      start_datetime: Date;
      date_utc: string;
      date_pacific: string;
      venue_id: string;
    }>>`
      SELECT id, title, start_datetime,
             DATE(start_datetime)::text as date_utc,
             DATE(start_datetime AT TIME ZONE 'America/Los_Angeles')::text as date_pacific,
             venue_id
      FROM events
      WHERE id IN (${eventId1}::uuid, ${eventId2}::uuid)
      ORDER BY start_datetime
    `;

    result.forEach(e => {
      console.log(`${e.title}`);
      console.log(`  ID: ${e.id}`);
      console.log(`  Start (raw): ${e.start_datetime}`);
      console.log(`  DATE (UTC): ${e.date_utc}`);
      console.log(`  DATE (Pacific): ${e.date_pacific}`);
      console.log(`  Venue ID: ${e.venue_id}`);
      console.log();
    });

    console.log('Checking if they match our deduplication criteria:');

    const matchCheck = await prisma.$queryRaw<Array<{
      same_venue: boolean;
      same_date_pacific: boolean;
      time_diff_hours: number;
    }>>`
      SELECT
        (e1.venue_id = e2.venue_id) as same_venue,
        (DATE(e1.start_datetime AT TIME ZONE 'America/Los_Angeles') = DATE(e2.start_datetime AT TIME ZONE 'America/Los_Angeles')) as same_date_pacific,
        ABS(EXTRACT(EPOCH FROM (e1.start_datetime - e2.start_datetime)) / 3600) as time_diff_hours
      FROM events e1, events e2
      WHERE e1.id = ${eventId1}::uuid
      AND e2.id = ${eventId2}::uuid
    `;

    const check = matchCheck[0];
    console.log(`  Same venue: ${check.same_venue ? '✓ YES' : '✗ NO'}`);
    console.log(`  Same date (Pacific): ${check.same_date_pacific ? '✓ YES' : '✗ NO'}`);
    console.log(`  Time difference: ${check.time_diff_hours.toFixed(2)} hours`);
    console.log(`  Within 8 hours: ${check.time_diff_hours <= 8 ? '✓ YES' : '✗ NO'}`);

  } catch (error: any) {
    console.error('Error:', error);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

check();
