import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { EventWithVenue, DuplicateEvent, DeduplicationResult } from '../types';
import { findSimilarEvents } from './search.service';
import { deleteCache } from '../lib/redis';

const AUTO_MERGE_THRESHOLD = 0.9;
const MANUAL_REVIEW_THRESHOLD = 0.85;

/**
 * Find potential duplicate events for a given event
 */
export async function findPotentialDuplicates(
  eventId: string,
  threshold = MANUAL_REVIEW_THRESHOLD
): Promise<DuplicateEvent[]> {
  try {
    // Use similarity search to find potential duplicates
    const similarEvents = await findSimilarEvents(eventId, {
      limit: 20,
      threshold,
    });

    // Additional filtering based on date proximity and venue
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });

    if (!event) {
      return [];
    }

    const duplicates: DuplicateEvent[] = [];

    for (const similar of similarEvents) {
      // Check if events are within 24 hours of each other
      const timeDiff = Math.abs(
        event.startDateTime.getTime() - similar.item.startDateTime.getTime()
      );
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff <= 24) {
        duplicates.push({
          event: similar.item,
          similarityScore: similar.score,
        });
      }
    }

    logger.info('Found potential duplicates', {
      eventId,
      duplicatesCount: duplicates.length,
    });

    return duplicates;
  } catch (error) {
    logger.error('Find potential duplicates error:', error);
    throw new Error('Failed to find potential duplicates');
  }
}

/**
 * Merge duplicate event into canonical event
 */
export async function mergeDuplicateEvent(
  canonicalEventId: string,
  duplicateEventId: string,
  similarityScore: number
): Promise<DeduplicationResult> {
  try {
    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Get both events
      const [canonicalEvent, duplicateEvent] = await Promise.all([
        tx.event.findUnique({
          where: { id: canonicalEventId },
          include: { venue: true, sources: true },
        }),
        tx.event.findUnique({
          where: { id: duplicateEventId },
          include: { venue: true, sources: true },
        }),
      ]);

      if (!canonicalEvent || !duplicateEvent) {
        throw new Error('One or both events not found');
      }

      // Record the duplicate relationship
      await tx.eventDuplicate.create({
        data: {
          canonicalEventId,
          duplicateEventId,
          similarityScore,
        },
      });

      // Move sources from duplicate to canonical
      // Handle case where both events have the same source URL
      if (duplicateEvent.sources.length > 0) {
        const canonicalSourceUrls = new Set(
          canonicalEvent.sources.map((s) => s.sourceUrl)
        );

        for (const source of duplicateEvent.sources) {
          if (canonicalSourceUrls.has(source.sourceUrl)) {
            // Canonical already has this source, delete duplicate's version
            await tx.eventSource.delete({
              where: { id: source.id },
            });
          } else {
            // Move source to canonical event
            await tx.eventSource.update({
              where: { id: source.id },
              data: { eventId: canonicalEventId },
            });
          }
        }
      }

      // Move user interactions
      await tx.userEventInteraction.updateMany({
        where: { eventId: duplicateEventId },
        data: { eventId: canonicalEventId },
      });

      // Merge metadata if needed
      const mergedMetadata = {
        ...((canonicalEvent.metadata as any) || {}),
        ...((duplicateEvent.metadata as any) || {}),
        mergedFrom: duplicateEventId,
        mergedAt: new Date().toISOString(),
      };

      // Update canonical event
      const updated = await tx.event.update({
        where: { id: canonicalEventId },
        data: {
          metadata: mergedMetadata,
        },
        include: { venue: true },
      });

      // Mark duplicate as merged
      await tx.event.update({
        where: { id: duplicateEventId },
        data: {
          status: 'MERGED',
        },
      });

      return {
        canonicalEvent: updated as EventWithVenue,
        duplicates: [
          {
            event: duplicateEvent as EventWithVenue,
            similarityScore,
          },
        ],
        merged: true,
      };
    });

    // Invalidate caches
    await deleteCache(`similar:${canonicalEventId}:*`);
    await deleteCache(`similar:${duplicateEventId}:*`);

    logger.info('Events merged successfully', {
      canonicalEventId,
      duplicateEventId,
      similarityScore,
    });

    return result;
  } catch (error) {
    logger.error('Merge duplicate event error:', error);
    throw new Error('Failed to merge duplicate event');
  }
}

/**
 * Auto-detect and merge high-confidence duplicates
 */
export async function autoMergeDuplicates(
  eventId: string
): Promise<DeduplicationResult | null> {
  try {
    // Find high-confidence duplicates
    const duplicates = await findPotentialDuplicates(
      eventId,
      AUTO_MERGE_THRESHOLD
    );

    if (duplicates.length === 0) {
      logger.info('No high-confidence duplicates found', { eventId });
      return null;
    }

    // Merge the first duplicate (highest similarity)
    const duplicate = duplicates[0];
    const result = await mergeDuplicateEvent(
      eventId,
      duplicate.event.id,
      duplicate.similarityScore
    );

    logger.info('Auto-merged duplicate', {
      canonicalEventId: eventId,
      duplicateEventId: duplicate.event.id,
    });

    return result;
  } catch (error) {
    logger.error('Auto-merge duplicates error:', error);
    throw new Error('Failed to auto-merge duplicates');
  }
}

/**
 * Get all duplicate relationships for an event
 */
export async function getDuplicateRelationships(eventId: string) {
  try {
    const [asCanonical, asDuplicate] = await Promise.all([
      prisma.eventDuplicate.findMany({
        where: { canonicalEventId: eventId },
        include: {
          duplicateEvent: {
            include: { venue: true },
          },
        },
      }),
      prisma.eventDuplicate.findMany({
        where: { duplicateEventId: eventId },
        include: {
          canonicalEvent: {
            include: { venue: true },
          },
        },
      }),
    ]);

    return {
      canonical: asCanonical,
      duplicate: asDuplicate,
    };
  } catch (error) {
    logger.error('Get duplicate relationships error:', error);
    throw new Error('Failed to get duplicate relationships');
  }
}

/**
 * Batch process all events for deduplication
 */
export async function batchDeduplicateEvents(
  options?: {
    limit?: number;
    autoMerge?: boolean;
  }
): Promise<{
  processed: number;
  duplicatesFound: number;
  merged: number;
}> {
  try {
    const { limit = 100, autoMerge = false } = options || {};

    // Get recent active events
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        startDateTime: {
          gte: new Date(),
        },
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    let processed = 0;
    let duplicatesFound = 0;
    let merged = 0;

    for (const event of events) {
      try {
        const duplicates = await findPotentialDuplicates(event.id);
        processed++;
        duplicatesFound += duplicates.length;

        if (autoMerge && duplicates.length > 0) {
          const highConfidence = duplicates.filter(
            (d) => d.similarityScore >= AUTO_MERGE_THRESHOLD
          );

          for (const duplicate of highConfidence) {
            await mergeDuplicateEvent(
              event.id,
              duplicate.event.id,
              duplicate.similarityScore
            );
            merged++;
          }
        }
      } catch (error) {
        logger.error('Error processing event for deduplication', {
          eventId: event.id,
          error,
        });
      }
    }

    logger.info('Batch deduplication completed', {
      processed,
      duplicatesFound,
      merged,
    });

    return {
      processed,
      duplicatesFound,
      merged,
    };
  } catch (error) {
    logger.error('Batch deduplicate events error:', error);
    throw new Error('Failed to batch deduplicate events');
  }
}
