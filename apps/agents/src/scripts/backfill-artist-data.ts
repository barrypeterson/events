#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { prisma, disconnect } from '@slo-events/database';
import { enrichArtist } from '../lib/artist-enrichment';
import { logger } from '../lib/scraper-utils';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Backfill artist enrichment data for existing MUSIC events
 */
async function backfillArtistData(limit: number = 100, dryRun: boolean = true) {
  try {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.log('❌ Spotify credentials not configured in .env');
      console.log('Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first');
      return;
    }

    console.log('Artist Data Backfill Tool');
    console.log('Mode:', dryRun ? 'DRY RUN' : 'BACKFILL');
    console.log(`Limit: ${limit} events\n`);

    // Find MUSIC events without artist data in metadata
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        category: {
          has: 'MUSIC'
        },
        startDateTime: {
          gte: new Date() // Only upcoming events
        },
        // Check if metadata doesn't have artistInfo
        // Note: Prisma doesn't support nested JSON checks well, so we'll filter in JS
      },
      orderBy: {
        startDateTime: 'asc'
      },
      take: limit,
    });

    // Filter events without artist data
    const eventsToEnrich = events.filter(e => {
      const metadata = e.metadata as any;
      return !metadata?.artistInfo;
    });

    console.log(`Found ${eventsToEnrich.length} MUSIC events without artist data (from ${events.length} total MUSIC events)\n`);

    if (eventsToEnrich.length === 0) {
      console.log('✓ All events already have artist data!');
      return;
    }

    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of eventsToEnrich) {
      console.log(`Processing: ${event.title}`);
      console.log(`  Venue: ${event.venue?.name || 'Unknown'}`);
      console.log(`  Date: ${event.startDateTime.toLocaleDateString()}`);

      try {
        // Attempt to enrich with artist data
        const artistInfo = await enrichArtist(
          event.title,
          event.description || undefined,
          event.tags
        );

        if (artistInfo) {
          console.log(`  ✓ Found: ${artistInfo.name} (${artistInfo.popularity} popularity, ${artistInfo.monthlyListeners?.toLocaleString()} listeners)`);
          console.log(`    Genres: ${artistInfo.genres?.join(', ') || 'N/A'}`);
          console.log(`    Spotify: ${artistInfo.spotifyUrl}`);

          if (!dryRun) {
            // Update event metadata with artist info
            const currentMetadata = (event.metadata as any) || {};
            const updatedMetadata = {
              ...currentMetadata,
              artistInfo,
              enrichedAt: new Date().toISOString(),
            };

            await prisma.event.update({
              where: { id: event.id },
              data: {
                metadata: updatedMetadata,
                // Add artist image if event has no image
                images: event.images.length === 0 && artistInfo.imageUrl
                  ? [artistInfo.imageUrl]
                  : event.images,
                // Add genres as tags if not present
                tags: artistInfo.genres
                  ? [...new Set([...event.tags, ...artistInfo.genres.map(g => g.toLowerCase()).slice(0, 3)])]
                  : event.tags,
              },
            });

            console.log(`    → Saved to database`);
          }

          enriched++;
        } else {
          console.log(`  ○ No artist data found (may be local band or cover band playing multiple artists)`);
          skipped++;
        }

        // Rate limiting: Wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.log(`  ✗ Error: ${error.message}`);
        failed++;
      }

      console.log();
    }

    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Events processed: ${eventsToEnrich.length}`);
    console.log(`Successfully enriched: ${enriched}`);
    console.log(`Skipped (no data): ${skipped}`);
    console.log(`Failed: ${failed}`);

    if (dryRun) {
      console.log('\n💡 To save artist data to database, run:');
      console.log('   pnpm exec tsx src/scripts/backfill-artist-data.ts --confirm');
    } else {
      console.log('\n✓ Artist data saved to database');
      console.log('Events now have artist images, genres, and Spotify links!');
    }

  } catch (error: any) {
    console.error('Error:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const limit = parseInt(args.find(arg => !arg.startsWith('--')) || '100');
const dryRun = !args.includes('--confirm') && !args.includes('-c');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Backfill Artist Data

Usage: pnpm exec tsx src/scripts/backfill-artist-data.ts [limit] [--confirm]

Arguments:
  limit               Number of events to process (default: 100)

Options:
  --confirm, -c       Actually save data (default is dry run)
  --help, -h          Show this help message

Examples:
  # Dry run - preview first 50 events
  pnpm exec tsx src/scripts/backfill-artist-data.ts 50

  # Backfill first 100 events
  pnpm exec tsx src/scripts/backfill-artist-data.ts 100 --confirm

  # Backfill all events (use large number)
  pnpm exec tsx src/scripts/backfill-artist-data.ts 1000 --confirm
`);
  process.exit(0);
}

backfillArtistData(limit, dryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
