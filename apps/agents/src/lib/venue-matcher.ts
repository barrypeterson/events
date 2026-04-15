import { prisma } from '@slo-events/database';
import { VenueMatch } from '../types';
import { logger, normalizeString } from './scraper-utils';

/**
 * Match venue name to existing venue in database, or create new one
 * Enhanced to check address/coordinates to prevent duplicate venue creation
 */
export async function matchOrCreateVenue(
  venueName: string,
  city: string = 'San Luis Obispo',
  address?: string,
  coordinates?: { lat: number; lng: number }
): Promise<VenueMatch> {
  try {
    const normalizedName = normalizeString(venueName);

    logger.debug(`Matching venue: ${venueName} (normalized: ${normalizedName})`);

    // Step 1: Try exact normalized name match
    let venue = await prisma.venue.findFirst({
      where: {
        normalizedName,
        city,
      },
    });

    if (venue) {
      logger.info(`Found exact venue match: ${venue.name} (${venue.id})`);
      return {
        venueId: venue.id,
        venueName: venue.name,
        normalizedName: venue.normalizedName,
        confidence: 1.0,
        isNew: false,
      };
    }

    // Step 2: Check for same address (if provided)
    if (address) {
      const addressMatch = await prisma.venue.findFirst({
        where: {
          address,
          city,
        },
      });

      if (addressMatch) {
        logger.info(`Found venue by address match: ${addressMatch.name} (${addressMatch.id}) - same address: ${address}`);
        return {
          venueId: addressMatch.id,
          venueName: addressMatch.name,
          normalizedName: addressMatch.normalizedName,
          confidence: 1.0,
          isNew: false,
        };
      }
    }

    // Step 3: Check for nearby coordinates (within 50 meters)
    if (coordinates?.lat && coordinates?.lng) {
      const nearbyVenues = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        normalized_name: string;
        distance_meters: number;
      }>>`
        SELECT id, name, normalized_name,
               (
                 6371000 * acos(
                   LEAST(1.0, GREATEST(-1.0,
                     cos(radians(${coordinates.lat})) * cos(radians(latitude)) *
                     cos(radians(longitude) - radians(${coordinates.lng})) +
                     sin(radians(${coordinates.lat})) * sin(radians(latitude))
                   ))
                 )
               ) as distance_meters
        FROM venues
        WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND city = ${city}
        HAVING distance_meters < 50
        ORDER BY distance_meters ASC
        LIMIT 1
      `;

      if (nearbyVenues.length > 0) {
        const match = nearbyVenues[0];
        logger.info(`Found venue by coordinates: ${match.name} (${match.id}) - ${match.distance_meters.toFixed(0)}m away`);
        return {
          venueId: match.id,
          venueName: match.name,
          normalizedName: match.normalized_name,
          confidence: 0.95,
          isNew: false,
        };
      }
    }

    // Step 4: Try fuzzy name match (similar normalized names)
    const similarVenues = await prisma.venue.findMany({
      where: {
        city,
      },
    });

    for (const candidate of similarVenues) {
      const similarity = calculateStringSimilarity(
        normalizedName,
        candidate.normalizedName
      );

      if (similarity > 0.85) {
        logger.info(
          `Found fuzzy venue match: ${candidate.name} (${candidate.id}) with ${similarity.toFixed(2)} similarity`
        );
        return {
          venueId: candidate.id,
          venueName: candidate.name,
          normalizedName: candidate.normalizedName,
          confidence: similarity,
          isNew: false,
        };
      }
    }

    // No match found, create new venue
    logger.info(`Creating new venue: ${venueName}`);
    venue = await prisma.venue.create({
      data: {
        name: venueName,
        normalizedName,
        city,
        state: 'CA',
        address: address || null,
        latitude: coordinates?.lat || null,
        longitude: coordinates?.lng || null,
        venueType: inferVenueType(venueName),
      },
    });

    return {
      venueId: venue.id,
      venueName: venue.name,
      normalizedName: venue.normalizedName,
      confidence: 1.0,
      isNew: true,
    };
  } catch (error: any) {
    logger.error(`Failed to match/create venue ${venueName}: ${error.message}`);
    throw new Error(`Venue matching failed: ${error.message}`);
  }
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
  if (len2 === 0) return 0.0;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Infer venue type from venue name
 */
function inferVenueType(venueName: string): string | undefined {
  const name = venueName.toLowerCase();

  if (name.includes('theater') || name.includes('theatre')) {
    return 'theater';
  }
  if (name.includes('brew') || name.includes('bar') || name.includes('pub')) {
    return 'bar';
  }
  if (name.includes('park') || name.includes('outdoor')) {
    return 'outdoor';
  }
  if (name.includes('stadium') || name.includes('arena')) {
    return 'stadium';
  }
  if (name.includes('club') || name.includes('lounge')) {
    return 'club';
  }
  if (name.includes('restaurant') || name.includes('cafe')) {
    return 'restaurant';
  }
  if (name.includes('gallery') || name.includes('museum')) {
    return 'gallery';
  }

  return 'venue'; // Generic
}

/**
 * Batch match venues for multiple events
 */
export async function matchVenues(
  venueNames: string[],
  city: string = 'San Luis Obispo'
): Promise<Map<string, VenueMatch>> {
  const results = new Map<string, VenueMatch>();
  const uniqueNames = [...new Set(venueNames)];

  logger.info(`Matching ${uniqueNames.length} unique venues`);

  for (const venueName of uniqueNames) {
    try {
      const match = await matchOrCreateVenue(venueName, city);
      results.set(venueName, match);
    } catch (error: any) {
      logger.error(`Failed to match venue ${venueName}: ${error.message}`);
    }
  }

  logger.info(`Matched ${results.size}/${uniqueNames.length} venues`);
  return results;
}

/**
 * Get venue by ID
 */
export async function getVenueById(venueId: string) {
  return prisma.venue.findUnique({
    where: { id: venueId },
  });
}

/**
 * Get all venues in a city
 */
export async function getVenuesByCity(city: string) {
  return prisma.venue.findMany({
    where: { city },
    orderBy: { name: 'asc' },
  });
}
