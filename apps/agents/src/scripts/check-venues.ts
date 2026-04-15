#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const venueIds = [
  '0d1acdef-a0ee-47bc-96b4-fd6bfd84ee72', // Cal Poly Arts (from Morgan Freeman event)
  '758033cf-dd57-462a-b0e2-20da4e537fdb'  // Performing Arts Center SLO (from Morgan Freeman event)
];

async function checkVenues() {
  try {
    for (const id of venueIds) {
      const venue = await prisma.venue.findUnique({
        where: { id },
      });

      if (!venue) {
        console.log(`Venue ${id} not found`);
        continue;
      }

      console.log('='.repeat(80));
      console.log(`Venue: ${venue.name}`);
      console.log('='.repeat(80));
      console.log(`ID: ${venue.id}`);
      console.log(`Address: ${venue.address || 'N/A'}`);
      console.log(`City: ${venue.city || 'N/A'}`);
      console.log(`State: ${venue.state || 'N/A'}`);
      console.log(`Latitude: ${venue.latitude || 'N/A'}`);
      console.log(`Longitude: ${venue.longitude || 'N/A'}`);
      console.log(`Normalized Name: ${venue.normalizedName || 'N/A'}`);
      console.log();
    }

    // Check if they're the same location
    const [venue1, venue2] = await Promise.all(
      venueIds.map(id => prisma.venue.findUnique({ where: { id } }))
    );

    if (venue1 && venue2) {
      console.log('='.repeat(80));
      console.log('COMPARISON');
      console.log('='.repeat(80));

      const sameAddress = venue1.address === venue2.address && venue1.address !== null;
      console.log(`\nSame Address: ${sameAddress ? '✓ YES' : '✗ NO'}`);
      console.log(`  Venue 1: ${venue1.address || 'N/A'}`);
      console.log(`  Venue 2: ${venue2.address || 'N/A'}`);

      if (venue1.latitude && venue2.latitude && venue1.longitude && venue2.longitude) {
        const distance = calculateDistance(
          venue1.latitude, venue1.longitude,
          venue2.latitude, venue2.longitude
        );
        console.log(`\nDistance: ${distance.toFixed(2)} meters`);
        console.log(`  Within 100m: ${distance < 100 ? '✓ YES (same location)' : '✗ NO'}`);
      } else {
        console.log(`\nNo coordinates available to calculate distance`);
      }

      console.log(`\nNormalized Name Similarity:`);
      if (venue1.normalizedName && venue2.normalizedName) {
        const result = await prisma.$queryRaw<Array<{ similarity: number }>>`
          SELECT similarity(${venue1.normalizedName}, ${venue2.normalizedName}) as similarity
        `;
        const similarity = result[0].similarity;
        console.log(`  ${(similarity * 100).toFixed(0)}%`);
        console.log(`  Venue 1: "${venue1.normalizedName}"`);
        console.log(`  Venue 2: "${venue2.normalizedName}"`);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
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

checkVenues();
