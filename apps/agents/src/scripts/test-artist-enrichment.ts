#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { disconnect } from '@slo-events/database';
import { enrichArtist, extractArtistName } from '../lib/artist-enrichment';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const testEvents = [
  {
    title: "Morgan Freeman's Symphonic Blues Experience",
    description: "Blues and symphonic music",
    tags: ['blues', 'symphonic']
  },
  {
    title: "Tis the Season with Ben Folds",
    description: "Holiday concert with piano",
    tags: ['holiday', 'piano']
  },
  {
    title: "ZZ Top with Night Ranger",
    description: "Classic rock concert",
    tags: ['rock', 'classic rock']
  },
  {
    title: "Unfinished with the Beatles",
    description: "Beatles tribute band",
    tags: ['beatles', 'covers', 'tribute']
  },
  {
    title: "Sweet Spots Dance Party",
    description: "Live music and dancing",
    tags: ['dance', 'covers', 'party']
  },
  {
    title: "Led Zepagain",
    description: "Led Zeppelin tribute",
    tags: ['led zeppelin', 'tribute', 'classic rock']
  },
  {
    title: "Trivia Night",
    description: "Weekly trivia competition",
    tags: ['trivia', 'games']
  },
  {
    title: "Cal Poly Football vs UC Davis",
    description: "Football game",
    tags: ['football', 'sports']
  }
];

async function testEnrichment() {
  try {
    console.log('Testing Artist Enrichment Service\n');
    console.log('='.repeat(80));

    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.log('⚠️  Spotify credentials not configured in .env');
      console.log('Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to test Spotify integration\n');
    }

    for (const event of testEvents) {
      console.log(`\nEvent: ${event.title}`);
      console.log('-'.repeat(80));

      // Step 1: Extract artist name
      const extraction = await extractArtistName(event.title, event.description, event.tags);

      if (!extraction.artistName) {
        console.log('  Result: No artist detected (likely not a music event)');
        continue;
      }

      console.log(`  Type: ${extraction.isCoverBand ? '🎭 Cover/Tribute Band' : '🎤 Original Artist'}`);
      console.log(`  Artist to lookup: "${extraction.artistName}"`);

      // Step 2: Enrich with Spotify (if configured)
      if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        const artistInfo = await enrichArtist(event.title, event.description, event.tags);

        if (artistInfo) {
          console.log('\n  Spotify Data:');
          console.log(`    Name: ${artistInfo.name}`);
          console.log(`    Genres: ${artistInfo.genres?.join(', ') || 'N/A'}`);
          console.log(`    Popularity: ${artistInfo.popularity || 'N/A'}/100`);
          console.log(`    Monthly Listeners: ${artistInfo.monthlyListeners?.toLocaleString() || 'N/A'}`);
          console.log(`    Spotify URL: ${artistInfo.spotifyUrl || 'N/A'}`);
          console.log(`    Image: ${artistInfo.imageUrl ? 'Available' : 'N/A'}`);

          if (artistInfo.topTracks && artistInfo.topTracks.length > 0) {
            console.log('    Top Tracks:');
            artistInfo.topTracks.forEach((track, idx) => {
              console.log(`      ${idx + 1}. ${track.name}`);
            });
          }

          if (artistInfo.youtubeChannelUrl) {
            console.log(`    YouTube: ${artistInfo.youtubeChannelUrl}`);
          }
        } else {
          console.log('  Result: Artist not found on Spotify');
        }
      } else {
        console.log('  (Spotify enrichment skipped - credentials not configured)');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✓ Test completed\n');

    console.log('Next Steps:');
    console.log('1. Add Spotify credentials to .env (get from https://developer.spotify.com/dashboard)');
    console.log('2. Optionally add YouTube API key for video content');
    console.log('3. Artist data will be automatically added to music events during scraping');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

testEnrichment();
