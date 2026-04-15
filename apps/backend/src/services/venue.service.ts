import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { VenueCreateInput, VenueUpdateInput } from '../types';
import { NotFoundError, ConflictError } from '../middleware/error';
import { generateEmbedding, createEmbeddingText } from '../lib/openai';

/**
 * Normalize venue name for comparison
 */
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Create a new venue
 */
export async function createVenue(input: VenueCreateInput) {
  try {
    const normalizedName = normalizeVenueName(input.name);

    // Check if venue already exists
    const existing = await prisma.venue.findUnique({
      where: {
        normalizedName_city: {
          normalizedName,
          city: input.city || 'San Luis Obispo',
        },
      },
    });

    if (existing) {
      throw new ConflictError('Venue with this name already exists in this city');
    }

    // Generate embedding for venue
    const embeddingText = createEmbeddingText({
      title: input.name,
      description: `${input.venueType || ''} ${input.address || ''}`,
      venueName: input.name,
    });
    const embedding = await generateEmbedding(embeddingText);

    // Create venue
    const venue = await prisma.$executeRaw`
      INSERT INTO venues (
        name, normalized_name, address, city, state, zip_code,
        latitude, longitude, website, phone, venue_type, embedding, metadata
      ) VALUES (
        ${input.name}, ${normalizedName}, ${input.address},
        ${input.city || 'San Luis Obispo'}, ${input.state || 'CA'}, ${input.zipCode},
        ${input.latitude}, ${input.longitude}, ${input.website}, ${input.phone},
        ${input.venueType}, ${embedding}::vector, ${JSON.stringify(input.metadata || {})}::jsonb
      )
      RETURNING *
    `;

    // Fetch the created venue
    const createdVenue = await prisma.venue.findFirst({
      where: { normalizedName, city: input.city || 'San Luis Obispo' },
    });

    logger.info('Venue created successfully', { venueId: createdVenue?.id });

    return createdVenue;
  } catch (error) {
    if (error instanceof ConflictError) {
      throw error;
    }
    logger.error('Create venue error:', error);
    throw new Error('Failed to create venue');
  }
}

/**
 * Get venue by ID
 */
export async function getVenueById(venueId: string) {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        events: {
          where: {
            status: 'ACTIVE',
            startDateTime: {
              gte: new Date(),
            },
          },
          take: 10,
          orderBy: {
            startDateTime: 'asc',
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundError('Venue not found');
    }

    return venue;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Get venue error:', error);
    throw new Error('Failed to get venue');
  }
}

/**
 * List all venues
 */
export async function listVenues(params?: {
  city?: string;
  venueType?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const { city, venueType, limit = 50, offset = 0 } = params || {};

    const where: any = {};
    if (city) where.city = city;
    if (venueType) where.venueType = venueType;

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: {
          name: 'asc',
        },
      }),
      prisma.venue.count({ where }),
    ]);

    return {
      venues,
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error('List venues error:', error);
    throw new Error('Failed to list venues');
  }
}

/**
 * Update venue
 */
export async function updateVenue(venueId: string, input: VenueUpdateInput) {
  try {
    const updateData: any = { ...input };

    // Update normalized name if name changed
    if (input.name) {
      updateData.normalizedName = normalizeVenueName(input.name);
    }

    // Regenerate embedding if relevant fields changed
    if (input.name || input.venueType) {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
      });

      if (venue) {
        const embeddingText = createEmbeddingText({
          title: input.name || venue.name,
          description: `${input.venueType || venue.venueType || ''} ${input.address || venue.address || ''}`,
          venueName: input.name || venue.name,
        });
        const embedding = await generateEmbedding(embeddingText);

        await prisma.$executeRaw`
          UPDATE venues
          SET embedding = ${embedding}::vector
          WHERE id = ${venueId}::uuid
        `;
      }
    }

    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: updateData,
    });

    logger.info('Venue updated successfully', { venueId });

    return venue;
  } catch (error) {
    logger.error('Update venue error:', error);
    throw new Error('Failed to update venue');
  }
}

/**
 * Delete venue
 */
export async function deleteVenue(venueId: string): Promise<void> {
  try {
    // Check if venue has active events
    const activeEvents = await prisma.event.count({
      where: {
        venueId,
        status: 'ACTIVE',
        startDateTime: {
          gte: new Date(),
        },
      },
    });

    if (activeEvents > 0) {
      throw new ConflictError(
        'Cannot delete venue with active upcoming events'
      );
    }

    await prisma.venue.delete({
      where: { id: venueId },
    });

    logger.info('Venue deleted successfully', { venueId });
  } catch (error) {
    if (error instanceof ConflictError) {
      throw error;
    }
    logger.error('Delete venue error:', error);
    throw new Error('Failed to delete venue');
  }
}

/**
 * Search venues by name
 */
export async function searchVenues(query: string, limit = 10) {
  try {
    const venues = await prisma.$queryRaw`
      SELECT * FROM venues
      WHERE name ILIKE ${`%${query}%`}
      ORDER BY similarity(name, ${query}) DESC
      LIMIT ${limit}
    `;

    return venues;
  } catch (error) {
    logger.error('Search venues error:', error);
    throw new Error('Failed to search venues');
  }
}

/**
 * Find or create venue with fuzzy matching
 */
export async function findOrCreateVenue(input: VenueCreateInput) {
  try {
    const { findMatchingVenues, getCanonicalVenueId } = require('../lib/venue-utils');

    // Find potential matches using multiple strategies
    const matches = await findMatchingVenues({
      name: input.name,
      address: input.address,
      city: input.city || 'San Luis Obispo',
      latitude: input.latitude ? Number(input.latitude) : undefined,
      longitude: input.longitude ? Number(input.longitude) : undefined,
    });

    if (matches.length > 0) {
      const bestMatch = matches[0];

      // Get canonical venue (in case the match is itself a duplicate)
      const canonicalId = await getCanonicalVenueId(bestMatch.venue.id);

      // If we found a non-exact match, log it for review
      if (bestMatch.matchReason !== 'exact') {
        logger.info('Venue matched using fuzzy logic', {
          input: input.name,
          matched: bestMatch.venue.name,
          reason: bestMatch.matchReason,
          score: bestMatch.similarityScore,
          distance: bestMatch.distance,
        });
      }

      // Return the canonical venue
      if (canonicalId !== bestMatch.venue.id) {
        const canonicalVenue = await prisma.venue.findUnique({
          where: { id: canonicalId },
        });
        return canonicalVenue || bestMatch.venue;
      }

      return bestMatch.venue;
    }

    // No match found, create new venue
    logger.info('Creating new venue (no matches found)', { name: input.name });
    return await createVenue(input);
  } catch (error) {
    logger.error('Find or create venue error:', error);
    throw new Error('Failed to find or create venue');
  }
}
