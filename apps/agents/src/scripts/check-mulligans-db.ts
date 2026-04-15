#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function checkMulligans() {
  try {
    const venue = await prisma.venue.findFirst({
      where: {
        name: {
          contains: 'Mulligan',
          mode: 'insensitive'
        }
      },
      include: {
        events: {
          where: {
            status: 'ACTIVE',
            startDateTime: {
              gte: new Date('2025-11-01')
            }
          },
          orderBy: {
            startDateTime: 'asc'
          }
        }
      }
    });

    if (!venue) {
      console.log('No Mulligan\'s venue found in database');
    } else {
      console.log(`Venue: ${venue.name} (${venue.id})`);
      console.log(`Events: ${venue.events.length}\n`);

      venue.events.forEach((e, i) => {
        console.log(`[${i+1}] ${e.title}`);
        console.log(`    Date: ${e.startDateTime.toLocaleString()}`);
        console.log(`    End: ${e.endDateTime ? e.endDateTime.toLocaleString() : 'N/A'}`);
        console.log(`    ID: ${e.id}`);
        console.log();
      });
    }

  } catch (error: any) {
    console.error('Error:', error);
  } finally {
    await disconnect();
  }
}

checkMulligans();
