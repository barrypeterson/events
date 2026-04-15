#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function checkStatus() {
  try {
    const eventId = 'cd092573-004b-4d46-82d4-431806e618c6';
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true, sources: true },
    });

    if (!event) {
      console.log('Event not found');
      return;
    }

    console.log('Event Details:');
    console.log(`  ID: ${event.id}`);
    console.log(`  Title: ${event.title}`);
    console.log(`  Normalized: "${event.normalizedTitle}"`);
    console.log(`  Status: ${event.status}`);
    console.log(`  Venue: ${event.venue.name}`);
    console.log(`  Venue ID: ${event.venueId}`);
    console.log(`  Start: ${event.startDateTime}`);
    console.log(`  End: ${event.endDateTime}`);
    console.log(`  Is Recurring: ${event.isRecurring}`);
    console.log(`  Created: ${event.createdAt}`);
    console.log(`  Sources: ${event.sources.map(s => s.sourceName).join(', ')}`);

  } catch (error: any) {
    console.error('Error:', error);
  } finally {
    await disconnect();
  }
}

checkStatus();
