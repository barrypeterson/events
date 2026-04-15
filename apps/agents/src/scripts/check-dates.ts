#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function checkDates() {
  try {
    const eventIds = [
      '7e6747de-4230-4afc-bf94-670c02d58efe',
      '433bca06-797a-4be1-a6ea-eab590315139'
    ];

    for (const id of eventIds) {
      const result = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        start_datetime: Date;
        date_part: string;
        timezone: string;
      }>>`
        SELECT id, title, start_datetime,
               DATE(start_datetime)::text as date_part,
               timezone
        FROM events
        WHERE id = ${id}::uuid
      `;

      if (result.length > 0) {
        const e = result[0];
        console.log(`Event: ${e.title}`);
        console.log(`  ID: ${e.id}`);
        console.log(`  start_datetime (raw): ${e.start_datetime}`);
        console.log(`  DATE(start_datetime): ${e.date_part}`);
        console.log(`  timezone: ${e.timezone}`);
        console.log();
      }
    }

    // Check if they're on the same date according to PostgreSQL
    const comparison = await prisma.$queryRaw<Array<{ same_date: boolean }>>`
      SELECT (
        DATE((SELECT start_datetime FROM events WHERE id = ${eventIds[0]}::uuid))
        =
        DATE((SELECT start_datetime FROM events WHERE id = ${eventIds[1]}::uuid))
      ) as same_date
    `;

    console.log(`PostgreSQL says same date: ${comparison[0].same_date ? '✓ YES' : '✗ NO'}`);

  } catch (error: any) {
    console.error('Error:', error);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

checkDates();
