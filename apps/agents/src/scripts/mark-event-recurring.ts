#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const eventId = process.argv[2];

if (!eventId) {
  console.log('Usage: npx tsx src/scripts/mark-event-recurring.ts <event-id>');
  process.exit(1);
}

async function markRecurring() {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      console.log('Event not found');
      return;
    }

    console.log(`Event: ${event.title}`);
    console.log(`Currently recurring: ${event.isRecurring}`);

    if (event.isRecurring) {
      console.log('Already marked as recurring');
      return;
    }

    const result = await prisma.event.update({
      where: { id: eventId },
      data: {
        isRecurring: true,
        recurringPattern: {
          detectedBy: 'manual',
          markedAt: new Date().toISOString()
        }
      }
    });

    console.log(`✓ Marked as recurring: ${result.title}`);

  } catch (error: any) {
    console.error('Error:', error);
  } finally {
    await disconnect();
  }
}

markRecurring();
