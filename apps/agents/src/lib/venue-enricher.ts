import { prisma } from '@slo-events/database';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from './scraper-utils';

let anthropicInstance: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicInstance;
}

/**
 * Known venue addresses in San Luis Obispo
 * Pre-populated to avoid API calls for common venues
 */
const KNOWN_VENUES: Record<string, { address: string; lat: number; lng: number }> = {
  'fremont theater': {
    address: '1035 Monterey St, San Luis Obispo, CA 93401',
    lat: 35.2828,
    lng: -120.6596,
  },
  'slo brew rock': {
    address: '855 Aerovista Pl, San Luis Obispo, CA 93401',
    lat: 35.2369,
    lng: -120.6425,
  },
  'performing arts center slo': {
    address: '1 Grand Ave, San Luis Obispo, CA 93407',
    lat: 35.3051,
    lng: -120.6597,
  },
  'cal poly arts': {
    address: '1 Grand Ave, San Luis Obispo, CA 93407', // Same as PAC
    lat: 35.3051,
    lng: -120.6597,
  },
  'frog & peach pub': {
    address: '728 Higuera St, San Luis Obispo, CA 93401',
    lat: 35.2827,
    lng: -120.6625,
  },
  'the mark slo': {
    address: '990 Industrial Way, San Luis Obispo, CA 93401',
    lat: 35.2698,
    lng: -120.6611,
  },
  'libertine brewing company': {
    address: '1234 Broad St, San Luis Obispo, CA 93401',
    lat: 35.2750,
    lng: -120.6650,
  },
  'madonna inn': {
    address: '100 Madonna Rd, San Luis Obispo, CA 93405',
    lat: 35.2477,
    lng: -120.6745,
  },
  'bang the drum brewery': {
    address: '1150 Laurel Ln, San Luis Obispo, CA 93401',
    lat: 35.2845,
    lng: -120.6432,
  },
  'vina robles amphitheatre': {
    address: '3800 Mill Rd, Paso Robles, CA 93446',
    lat: 35.6436,
    lng: -120.6911,
  },
  'siren morro bay': {
    address: '900 Main St, Morro Bay, CA 93442',
    lat: 35.3655,
    lng: -120.8498,
  },
  'black sheep bar & grill': {
    address: '995 Monterey St, San Luis Obispo, CA 93401',
    lat: 35.2810,
    lng: -120.6590,
  },
};

/**
 * Enrich a venue with address and geocoding data
 */
export async function enrichVenue(venueId: string, venueName: string): Promise<void> {
  try {
    const normalizedName = venueName.toLowerCase().trim();

    // Check if we have known data for this venue
    const knownData = KNOWN_VENUES[normalizedName];

    if (knownData) {
      await prisma.venue.update({
        where: { id: venueId },
        data: {
          address: knownData.address.split(',')[0],
          city: 'San Luis Obispo',
          state: 'CA',
          latitude: knownData.lat,
          longitude: knownData.lng,
        },
      });
      logger.info(`Enriched venue ${venueName} with known address data`);
      return;
    }

    // For unknown venues, use Claude to find the address
    logger.info(`Looking up address for: ${venueName}`);

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `What is the full street address of "${venueName}" in San Luis Obispo or SLO County, California?

Return ONLY a JSON object with this format, no other text:
{
  "address": "123 Main St",
  "city": "San Luis Obispo",
  "state": "CA",
  "zipCode": "93401"
}

If you don't know the address, return: {"address": null}`
      }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const addressData = JSON.parse(jsonMatch[0]);

      if (addressData.address) {
        await prisma.venue.update({
          where: { id: venueId },
          data: {
            address: addressData.address,
            city: addressData.city || 'San Luis Obispo',
            state: addressData.state || 'CA',
            zipCode: addressData.zipCode,
          },
        });
        logger.info(`Enriched venue ${venueName} with Claude-found address`);
      }
    }
  } catch (error: any) {
    logger.warn(`Failed to enrich venue ${venueName}: ${error.message}`);
  }
}

/**
 * Enrich all venues missing location data
 */
export async function enrichAllVenues(): Promise<void> {
  const venuesNeedingEnrichment = await prisma.venue.findMany({
    where: {
      OR: [
        { address: null },
        { address: '' },
        { latitude: null },
      ],
    },
  });

  logger.info(`Found ${venuesNeedingEnrichment.length} venues needing enrichment`);

  for (const venue of venuesNeedingEnrichment) {
    await enrichVenue(venue.id, venue.name);
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info(`Venue enrichment complete`);
}
