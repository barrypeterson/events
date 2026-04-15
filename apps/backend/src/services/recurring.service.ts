import { prisma } from '../config/database';
import { logger } from '../lib/logger';

/**
 * Extract core pattern from event title
 */
function extractRecurringPattern(title: string): string {
  const stopWords = new Set([
    'at', 'the', 'and', 'with', 'live', 'night', 'show', 'event',
    'concert', 'series', 'music', 'free', 'afternoon', 'evening',
    'morning', 'presents', 'featuring', 'special',
  ]);

  return title
    .toLowerCase()
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 4)
    .join(' ')
    .trim();
}

/**
 * Mark event as recurring and learn the pattern
 */
export async function markEventRecurring(eventId: string, isRecurring: boolean) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const corePattern = extractRecurringPattern(event.title);

    // Generate series ID if marking as recurring
    let seriesId = event.recurringSeriesId;
    if (isRecurring && !seriesId && corePattern) {
      const crypto = require('crypto');
      const hash = crypto
        .createHash('md5')
        .update(`${corePattern}-${event.venueId}-weekly`)
        .digest('hex')
        .substring(0, 16);
      seriesId = `series-${hash}`;
    }

    // Update event
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        isRecurring,
        recurringSeriesId: isRecurring ? seriesId : null,
      },
    });

    // Learn from this manual flag
    if (corePattern) {
      if (isRecurring) {
        // Add or strengthen pattern
        // First check if pattern exists to calculate new confidence
        const existingPattern = await prisma.recurringPattern.findUnique({
          where: {
            pattern_venueId: {
              pattern: corePattern,
              venueId: event.venueId,
            },
          },
        });

        const newConfidence = existingPattern
          ? Math.min(Number(existingPattern.confidence) + 0.1, 1.0)
          : 0.8;

        await prisma.recurringPattern.upsert({
          where: {
            pattern_venueId: {
              pattern: corePattern,
              venueId: event.venueId,
            },
          },
          create: {
            pattern: corePattern,
            venueId: event.venueId,
            frequency: 'unknown',
            confidence: 0.8,
            source: 'manual',
            timesDetected: 1,
            metadata: {
              examples: [{ title: event.title, eventId: event.id }],
            },
          },
          update: {
            confidence: newConfidence,
            timesDetected: { increment: 1 },
            lastSeen: new Date(),
          },
        });

        logger.info('Learned recurring pattern from manual flag', {
          pattern: corePattern,
          venue: event.venue.name,
          eventTitle: event.title,
        });
      } else {
        // User marked it as NOT recurring - decrease confidence
        const existing = await prisma.recurringPattern.findUnique({
          where: {
            pattern_venueId: {
              pattern: corePattern,
              venueId: event.venueId,
            },
          },
        });

        if (existing) {
          const newConfidence = Math.max(Number(existing.confidence) - 0.2, 0);

          if (newConfidence < 0.3) {
            await prisma.recurringPattern.delete({
              where: { id: existing.id },
            });
            logger.info('Deleted low-confidence recurring pattern', { pattern: corePattern });
          } else {
            await prisma.recurringPattern.update({
              where: { id: existing.id },
              data: { confidence: newConfidence },
            });
          }
        }
      }
    }

    return updated;
  } catch (error) {
    logger.error('Mark event recurring error:', error);
    throw new Error('Failed to mark event as recurring');
  }
}

/**
 * Get learned recurring patterns
 */
export async function getRecurringPatterns() {
  try {
    const patterns = await prisma.recurringPattern.findMany({
      include: {
        venue: true,
      },
      orderBy: [{ confidence: 'desc' }, { timesDetected: 'desc' }],
    });

    return patterns;
  } catch (error) {
    logger.error('Get recurring patterns error:', error);
    throw new Error('Failed to get recurring patterns');
  }
}
