import { prisma } from '@slo-events/database';
import { logger } from './scraper-utils';

/**
 * Get canonical event ID by following merge chain
 */
export async function getCanonicalEventId(eventId: string): Promise<string> {
  const duplicate = await prisma.eventDuplicate.findFirst({
    where: {
      duplicateEventId: eventId,
    },
    orderBy: {
      mergedAt: 'desc',
    },
  });

  if (duplicate) {
    // Recursively find the canonical event (follow the chain)
    return getCanonicalEventId(duplicate.canonicalEventId);
  }

  return eventId;
}

/**
 * Extract core pattern from event title for recurring detection
 */
export function extractRecurringPattern(title: string): string {
  const stopWords = new Set([
    'at', 'the', 'and', 'with', 'live', 'night', 'show', 'event',
    'concert', 'series', 'music', 'free', 'afternoon', 'evening',
    'morning', 'presents', 'featuring', 'special'
  ]);

  return title
    .toLowerCase()
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 4) // First 4 significant words
    .join(' ')
    .trim();
}

/**
 * Check if event title matches known recurring patterns
 */
export async function matchRecurringPattern(
  title: string,
  venueId: string
): Promise<{ matched: boolean; pattern?: any; confidence: number }> {
  const corePattern = extractRecurringPattern(title);

  if (!corePattern) {
    return { matched: false, confidence: 0 };
  }

  // Check venue-specific patterns first
  const venuePattern = await prisma.recurringPattern.findFirst({
    where: {
      pattern: corePattern,
      venueId,
    },
    orderBy: {
      confidence: 'desc',
    },
  });

  if (venuePattern) {
    return {
      matched: true,
      pattern: venuePattern,
      confidence: Number(venuePattern.confidence),
    };
  }

  // Check global patterns
  const globalPattern = await prisma.recurringPattern.findFirst({
    where: {
      pattern: corePattern,
      venueId: null,
    },
    orderBy: {
      confidence: 'desc',
    },
  });

  if (globalPattern) {
    return {
      matched: true,
      pattern: globalPattern,
      confidence: Number(globalPattern.confidence),
    };
  }

  // Check for keyword-based patterns
  const recurringKeywords = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'weekly', 'daily', 'trivia', 'bingo', 'open mic', 'karaoke',
    'happy hour', 'taco tuesday', 'ladies night', 'game night',
    'comedy night', 'jam session', 'live music'
  ];

  const lowerTitle = title.toLowerCase();
  const hasKeyword = recurringKeywords.some(keyword => lowerTitle.includes(keyword));

  if (hasKeyword) {
    return {
      matched: true,
      confidence: 0.7, // Lower confidence for keyword-only match
    };
  }

  return { matched: false, confidence: 0 };
}

/**
 * Learn from manual recurring flag
 */
export async function learnRecurringPattern(
  eventId: string,
  isRecurring: boolean
): Promise<void> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });

    if (!event) return;

    const corePattern = extractRecurringPattern(event.title);
    if (!corePattern) return;

    if (isRecurring) {
      // Add or strengthen pattern
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
          frequency: 'unknown', // Will be detected over time
          confidence: 0.8, // Manual flag gets high confidence
          source: 'manual',
          timesDetected: 1,
          metadata: {
            examples: [{ title: event.title, eventId: event.id }],
          },
        },
        update: {
          confidence: prisma.raw('LEAST(confidence + 0.1, 1.0)'), // Increase confidence, max 1.0
          timesDetected: { increment: 1 },
          lastSeen: new Date(),
          metadata: prisma.raw(`
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{examples}',
              COALESCE(metadata->'examples', '[]'::jsonb) || '${JSON.stringify([{ title: event.title, eventId: event.id }])}'::jsonb,
              true
            )
          `),
        },
      });

      logger.info('Learned recurring pattern', {
        pattern: corePattern,
        venue: event.venue.name,
        eventTitle: event.title,
      });
    } else {
      // User said it's NOT recurring - decrease confidence
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
          // Low confidence, delete pattern
          await prisma.recurringPattern.delete({
            where: { id: existing.id },
          });
          logger.info('Deleted low-confidence recurring pattern', { pattern: corePattern });
        } else {
          // Decrease confidence
          await prisma.recurringPattern.update({
            where: { id: existing.id },
            data: {
              confidence: newConfidence,
            },
          });
          logger.info('Decreased confidence for recurring pattern', {
            pattern: corePattern,
            newConfidence,
          });
        }
      }
    }
  } catch (error: any) {
    logger.error('Failed to learn recurring pattern:', error);
  }
}

/**
 * Generate recurring series ID for grouping
 */
export function generateRecurringSeriesId(
  pattern: string,
  venueId: string,
  frequency: string
): string {
  const crypto = require('crypto');
  const hash = crypto
    .createHash('md5')
    .update(`${pattern}-${venueId}-${frequency}`)
    .digest('hex')
    .substring(0, 16);

  return `series-${hash}`;
}
