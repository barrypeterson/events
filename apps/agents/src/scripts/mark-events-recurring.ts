#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const eventIds = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

if (eventIds.length === 0) {
  console.log('Usage: npx tsx src/scripts/mark-events-recurring.ts <event-id-1> <event-id-2> ...');
  console.log('\nOr pass multiple IDs separated by spaces');
  process.exit(1);
}

async function markEventsRecurring() {
  try {
    console.log(`Marking ${eventIds.length} events as recurring...\n`);

    for (const eventId of eventIds) {
      try {
        const event = await prisma.event.findUnique({
          where: { id: eventId }
        });

        if (!event) {
          console.log(`✗ Event not found: ${eventId}`);
          continue;
        }

        if (event.isRecurring) {
          console.log(`○ Already recurring: ${event.title}`);
          continue;
        }

        await prisma.event.update({
          where: { id: eventId },
          data: {
            isRecurring: true,
            recurringPattern: {
              detectedBy: 'manual',
              markedAt: new Date().toISOString()
            }
          }
        });

        console.log(`✓ Marked as recurring: ${event.title}`);

      } catch (error: any) {
        console.log(`✗ Failed ${eventId}: ${error.message}`);
      }
    }

    console.log('\n✓ Completed');

  } catch (error: any) {
    console.error('Error:', error);
  } finally {
    await disconnect();
  }
}

markEventsRecurring();
