/**
 * One-time migration: creates VenueScraperConfig records from the
 * hardcoded scraperRegistry in scheduler.ts.
 *
 * Run: npx tsx apps/agents/src/scripts/migrate-scraper-registry.ts
 */
import { prisma, disconnect } from '@slo-events/database';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// The old registry data (extracted from scheduler.ts)
const REGISTRY = [
  { name: 'fremont-theater', url: 'https://www.fremontslo.com/shows', venue: 'Fremont Theater' },
  { name: 'slo-brew', url: 'https://slobrew.com/events/', venue: 'SLO Brew Rock' },
  { name: 'pac-slo', url: 'https://www.pacslo.org/events', venue: 'Performing Arts Center SLO' },
  { name: 'cal-poly-arts', url: 'https://www.pacslo.org/calpolyarts', venue: 'Cal Poly Arts' },
  { name: 'madonna-inn', url: 'https://www.madonnainn.com/calendar', venue: 'Madonna Inn' },
  { name: 'vina-robles', url: 'https://vinaroblesamphitheatre.com/concerts', venue: 'Vina Robles Amphitheatre' },
  { name: 'santa-barbara-bowl', url: 'https://sbbowl.com/concerts/', venue: 'Santa Barbara Bowl' },
  { name: 'the-mark', url: 'https://www.themarkslo.com/music', venue: 'The Mark SLO' },
  { name: 'black-sheep', url: 'https://www.blacksheepslo.com/', venue: 'Black Sheep Bar & Grill' },
  { name: 'the-siren-morro-bay', url: 'https://thesirenmorrobay.com/events/', venue: 'Siren Morro Bay' },
  { name: 'club-car-bar', url: 'https://www.templetonmercantile.com/events', venue: 'Club Car Bar' },
  { name: 'libertine-brewing', url: 'https://libertinebrewing.com/publiceventsatlibertine', venue: 'Libertine Brewing Company' },
  { name: 'humdinger-slo', url: 'https://humdingerbrewing.com/san-luis-obispo-location', venue: 'Humdinger Brewing SLO' },
  { name: 'shindig-cider', url: 'https://www.shindigcider.com/events', venue: 'Shindig Cider House' },
  { name: 'central-coast-brewing', url: 'https://www.centralcoastbrewing.com/', venue: 'Central Coast Brewing' },
  { name: 'tap-it-brewing', url: 'https://www.tapitbrewing.com/', venue: 'Tap It Brewing' },
  { name: 'barrelhouse-paso', url: 'https://barrelhousebrewing.com/events-pasorobles', venue: 'BarrelHouse Brewing Paso Robles' },
  { name: 'downtown-slo', url: 'https://downtownslo.com/events/calendar', venue: 'Downtown SLO' },
  { name: 'big-big-slo', url: 'https://www.bigbigslo.com/webcalendar', venue: 'Big Big SLO Music Calendar' },
  { name: 'visit-slo', url: 'https://visitslo.com/events/', venue: 'Visit SLO Events' },
  { name: 'highway-1-roadtrip', url: 'https://highway1roadtrip.com/events/', venue: 'Area Events' },
  { name: 'cal-poly-athletics', url: 'https://gopoly.com/calendar', venue: 'Cal Poly Athletics' },
  { name: 'slo-childrens-museum', url: 'https://www.slocm.org/programs', venue: "SLO Children's Museum" },
  { name: 'slo-county-library', url: 'https://www.slolibrary.org/index.php/kids', venue: 'SLO County Library' },
  { name: 'slo-city-parks-recreation', url: 'https://www.slocity.org/living/calendars/community-activities', venue: 'SLO City Parks & Recreation' },
  { name: 'slo-county-parks', url: 'https://slocountyparks.com/special-events/', venue: 'SLO County Parks' },
  { name: 'first-5-slo', url: 'https://www.first5slo.org/community-happenings.php', venue: 'First 5 SLO County' },
  { name: 'sanluisobispomom', url: 'https://www.sanluisobispomom.com/family-friendly-events.php', venue: 'SanLuisObispoMom.com' },
  { name: 'slo-botanical-garden', url: 'https://www.slobg.org/events', venue: 'SLO Botanical Garden' },
  // Removed: bang-the-drum (redirects to unrelated business)
  // Removed: mulligans-bar-grill (image calendar scraper, needs separate approach)
];

async function main() {
  console.log(`Migrating ${REGISTRY.length} scrapers to VenueScraperConfig...`);

  let created = 0;
  let skipped = 0;

  for (const entry of REGISTRY) {
    // Find or create the venue
    let venue = await prisma.venue.findFirst({
      where: {
        OR: [
          { normalizedName: entry.venue.toLowerCase().trim() },
          { name: entry.venue },
        ],
      },
    });

    if (!venue) {
      venue = await prisma.venue.create({
        data: {
          name: entry.venue,
          normalizedName: entry.venue.toLowerCase().trim(),
          city: 'San Luis Obispo',
          state: 'CA',
        },
      });
      console.log(`  Created venue: ${entry.venue}`);
    }

    // Check if config already exists
    const existing = await prisma.venueScraperConfig.findUnique({
      where: { sourceName: entry.name },
    });

    if (existing) {
      console.log(`  Skipping ${entry.name} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.venueScraperConfig.create({
      data: {
        venueId: venue.id,
        sourceUrl: entry.url,
        sourceName: entry.name,
        scrapingEnabled: false, // Start disabled, enable after analysis
        schedule: '0 */6 * * *',
      },
    });

    console.log(`  Created config: ${entry.name} → ${entry.venue}`);
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  console.log('Next: run analyze on each venue, then enable scraping.');
  await disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await disconnect();
  process.exit(1);
});
