import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '@slo-events/database';
import { logger } from '../lib/scraper-utils';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function checkDuplicateEvents() {
  try {
    const eventIds = [
      '1c233805-5c2b-4211-bac5-b3c9676d603b',
      '7ca4c67f-91f3-4ffa-b33f-b358574b1185',
    ];

    logger.info('Checking events...');

    for (const eventId of eventIds) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          venue: true,
          sources: true,
          duplicates: true,
          duplicateOf: true,
        },
      });

      if (!event) {
        logger.warn(`Event ${eventId} not found`);
        continue;
      }

      logger.info(`\nEvent: ${event.title}`);
      logger.info(`  ID: ${event.id}`);
      logger.info(`  Date: ${event.startDateTime}`);
      logger.info(`  Venue: ${event.venue.name} (${event.venueId})`);
      logger.info(`  Status: ${event.status}`);
      logger.info(`  Is Recurring: ${event.isRecurring}`);
      logger.info(`  Series ID: ${event.recurringSeriesId || 'none'}`);
      logger.info(`  Sources: ${event.sources.length}`);
      event.sources.forEach((source) => {
        logger.info(`    - ${source.sourceName}: ${source.sourceUrl}`);
      });
      logger.info(`  Marked as duplicate of: ${event.duplicateOf.length} events`);
      logger.info(`  Has duplicates: ${event.duplicates.length} events`);
    }

    // Check if these events are already marked as duplicates
    logger.info('\n\nChecking duplicate relationships...');
    const duplicateRelation = await prisma.eventDuplicate.findFirst({
      where: {
        OR: [
          {
            canonicalEventId: eventIds[0],
            duplicateEventId: eventIds[1],
          },
          {
            canonicalEventId: eventIds[1],
            duplicateEventId: eventIds[0],
          },
        ],
      },
    });

    if (duplicateRelation) {
      logger.info('These events are already marked as duplicates!');
      logger.info(`  Canonical: ${duplicateRelation.canonicalEventId}`);
      logger.info(`  Duplicate: ${duplicateRelation.duplicateEventId}`);
      logger.info(`  Similarity: ${duplicateRelation.similarityScore}`);
    } else {
      logger.info('These events are NOT marked as duplicates yet.');
    }

    // Calculate similarity
    const events = await Promise.all(
      eventIds.map((id) =>
        prisma.event.findUnique({
          where: { id },
          include: { venue: true },
        })
      )
    );

    if (events[0] && events[1]) {
      logger.info('\n\nSimilarity Analysis:');
      logger.info(`  Title similarity: "${events[0].title}" vs "${events[1].title}"`);
      logger.info(`  Venue: "${events[0].venue.name}" vs "${events[1].venue.name}"`);
      logger.info(`  Date: ${events[0].startDateTime} vs ${events[1].startDateTime}`);

      const titleSimilar = events[0].normalizedTitle === events[1].normalizedTitle;
      const dateSimilar = Math.abs(
        new Date(events[0].startDateTime).getTime() - new Date(events[1].startDateTime).getTime()
      ) < 24 * 60 * 60 * 1000; // Within 24 hours

      logger.info(`  Same normalized title: ${titleSimilar}`);
      logger.info(`  Same date (within 24h): ${dateSimilar}`);
    }
  } catch (error: any) {
    logger.error(`Error: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
checkDuplicateEvents()
  .then(() => {
    logger.info('\n\nScript completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
