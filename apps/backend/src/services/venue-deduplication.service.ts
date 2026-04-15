import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import {
  findMatchingVenues,
  calculateDistance,
  calculateNameSimilarity,
} from '../lib/venue-utils';

/**
 * Find potential duplicate venues
 */
export async function findPotentialDuplicates() {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        _count: { select: { events: true } },
        duplicateOf: true,
      },
      orderBy: { name: 'asc' },
    });

    const duplicateGroups: Array<{
      canonical: any;
      duplicates: Array<{
        venue: any;
        matchReason: string;
        similarityScore: number;
        distance?: number;
      }>;
    }> = [];

    const processed = new Set<string>();

    for (const venue of venues) {
      // Skip if already processed or already marked as duplicate
      if (processed.has(venue.id) || venue.duplicateOf.length > 0) continue;

      const matches = await findMatchingVenues({
        name: venue.name,
        address: venue.address || undefined,
        city: venue.city || undefined,
        latitude: venue.latitude ? Number(venue.latitude) : undefined,
        longitude: venue.longitude ? Number(venue.longitude) : undefined,
      });

      // Filter out the venue itself and already processed venues
      const potentialDuplicates = matches.filter(
        (m) => m.venue.id !== venue.id && !processed.has(m.venue.id)
      );

      if (potentialDuplicates.length > 0) {
        duplicateGroups.push({
          canonical: venue,
          duplicates: potentialDuplicates.map((m) => ({
            venue: m.venue,
            matchReason: m.matchReason,
            similarityScore: m.similarityScore,
            distance: m.distance,
          })),
        });

        // Mark all as processed
        processed.add(venue.id);
        potentialDuplicates.forEach((m) => processed.add(m.venue.id));
      }
    }

    return duplicateGroups;
  } catch (error) {
    logger.error('Find potential duplicates error:', error);
    throw new Error('Failed to find potential duplicates');
  }
}

/**
 * Merge venues - move all events from duplicate to canonical
 */
export async function mergeVenues(canonicalId: string, duplicateIds: string[]) {
  try {
    // Fetch canonical venue
    const canonical = await prisma.venue.findUnique({
      where: { id: canonicalId },
      include: {
        events: { where: { status: 'ACTIVE' } },
        _count: { select: { events: true } },
      },
    });

    if (!canonical) {
      throw new Error('Canonical venue not found');
    }

    // Fetch duplicate venues
    const duplicates = await prisma.venue.findMany({
      where: { id: { in: duplicateIds } },
      include: {
        events: { where: { status: 'ACTIVE' } },
        _count: { select: { events: true } },
      },
    });

    if (duplicates.length !== duplicateIds.length) {
      throw new Error('Some duplicate venues not found');
    }

    const results = await prisma.$transaction(async (tx) => {
      const mergeResults = [];

      for (const duplicate of duplicates) {
        // Calculate match info
        const similarity = calculateNameSimilarity(canonical.name, duplicate.name);
        let matchReason: 'same_address' | 'same_coordinates' | 'fuzzy_name' = 'fuzzy_name';
        let distance: number | undefined;

        if (canonical.address && duplicate.address && canonical.address === duplicate.address) {
          matchReason = 'same_address';
        } else if (
          canonical.latitude &&
          canonical.longitude &&
          duplicate.latitude &&
          duplicate.longitude
        ) {
          distance = calculateDistance(
            Number(canonical.latitude),
            Number(canonical.longitude),
            Number(duplicate.latitude),
            Number(duplicate.longitude)
          );
          if (distance < 50) {
            matchReason = 'same_coordinates';
          }
        }

        // Move all events to canonical venue
        const movedEvents = await tx.event.updateMany({
          where: { venueId: duplicate.id },
          data: { venueId: canonicalId },
        });

        // Create or update VenueDuplicate record
        await tx.venueDuplicate.upsert({
          where: {
            canonicalVenueId_duplicateVenueId: {
              canonicalVenueId: canonicalId,
              duplicateVenueId: duplicate.id,
            },
          },
          create: {
            canonicalVenueId: canonicalId,
            duplicateVenueId: duplicate.id,
            similarityScore: similarity,
            matchReason,
            distance: distance ? Math.round(distance) : null,
            mergedBy: 'manual',
          },
          update: {
            similarityScore: similarity,
            matchReason,
            distance: distance ? Math.round(distance) : null,
            mergedBy: 'manual',
            mergedAt: new Date(),
          },
        });

        // Update canonical venue with merged data (take best data)
        await tx.venue.update({
          where: { id: canonicalId },
          data: {
            address: canonical.address || duplicate.address,
            city: canonical.city || duplicate.city,
            state: canonical.state || duplicate.state,
            zipCode: canonical.zipCode || duplicate.zipCode,
            latitude: canonical.latitude || duplicate.latitude,
            longitude: canonical.longitude || duplicate.longitude,
            website: canonical.website || duplicate.website,
            phone: canonical.phone || duplicate.phone,
            metadata: {
              ...(canonical.metadata as any || {}),
              mergedVenues: [
                ...((canonical.metadata as any)?.mergedVenues || []),
                {
                  id: duplicate.id,
                  name: duplicate.name,
                  mergedAt: new Date().toISOString(),
                },
              ],
            },
          },
        });

        // Mark duplicate as merged in metadata
        await tx.venue.update({
          where: { id: duplicate.id },
          data: {
            metadata: {
              ...(duplicate.metadata as any || {}),
              mergedInto: canonicalId,
              mergedAt: new Date().toISOString(),
              status: 'MERGED',
            },
          },
        });

        mergeResults.push({
          duplicateId: duplicate.id,
          duplicateName: duplicate.name,
          eventsMovedCount: movedEvents.count,
        });
      }

      return mergeResults;
    });

    logger.info('Venues merged successfully', {
      canonicalId,
      canonicalName: canonical.name,
      mergedCount: duplicates.length,
      results,
    });

    return {
      canonical,
      mergedVenues: results,
      totalEventsMoved: results.reduce((sum, r) => sum + r.eventsMovedCount, 0),
    };
  } catch (error) {
    logger.error('Merge venues error:', error);
    throw new Error('Failed to merge venues');
  }
}

/**
 * Get venues with their duplicate information
 */
export async function getVenuesWithDuplicates() {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        _count: { select: { events: true } },
        duplicates: {
          include: {
            duplicateVenue: true,
          },
        },
        duplicateOf: {
          include: {
            canonicalVenue: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return venues;
  } catch (error) {
    logger.error('Get venues with duplicates error:', error);
    throw new Error('Failed to get venues with duplicates');
  }
}
