import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '@slo-events/database';
import { logger } from '../lib/scraper-utils';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function mergeEvents(eventId1: string, eventId2: string) {
  try {
    logger.info('Checking events...');

    const [event1, event2] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId1 },
        include: {
          venue: true,
          sources: true,
          duplicates: true,
          duplicateOf: true,
        },
      }),
      prisma.event.findUnique({
        where: { id: eventId2 },
        include: {
          venue: true,
          sources: true,
          duplicates: true,
          duplicateOf: true,
        },
      }),
    ]);

    if (!event1 || !event2) {
      throw new Error('One or both events not found');
    }

    logger.info(`\nEvent 1: "${event1.title}"`);
    logger.info(`  ID: ${event1.id}`);
    logger.info(`  Date: ${event1.startDateTime}`);
    logger.info(`  Venue: ${event1.venue.name}`);
    logger.info(`  Sources: ${event1.sources.length}`);
    logger.info(`  Images: ${event1.images.length}`);

    logger.info(`\nEvent 2: "${event2.title}"`);
    logger.info(`  ID: ${event2.id}`);
    logger.info(`  Date: ${event2.startDateTime}`);
    logger.info(`  Venue: ${event2.venue.name}`);
    logger.info(`  Sources: ${event2.sources.length}`);
    logger.info(`  Images: ${event2.images.length}`);

    // Determine which should be canonical (prefer one with more complete data)
    const event1Score =
      event1.images.length * 3 +
      event1.sources.length * 2 +
      (event1.description?.length || 0) / 100 +
      (event1.ticketUrl ? 1 : 0);

    const event2Score =
      event2.images.length * 3 +
      event2.sources.length * 2 +
      (event2.description?.length || 0) / 100 +
      (event2.ticketUrl ? 1 : 0);

    const [canonical, duplicate] = event1Score >= event2Score
      ? [event1, event2]
      : [event2, event1];

    logger.info(`\nSelected canonical: "${canonical.title}" (score: ${event1Score >= event2Score ? event1Score : event2Score})`);
    logger.info(`Merging duplicate: "${duplicate.title}"`);

    // 1. Move all sources
    logger.info('\n1. Moving sources...');
    for (const source of duplicate.sources) {
      const existingSource = canonical.sources.find(
        (s) => s.sourceUrl === source.sourceUrl && s.sourceName === source.sourceName
      );

      if (!existingSource) {
        await prisma.eventSource.update({
          where: { id: source.id },
          data: { eventId: canonical.id },
        });
        logger.info(`  Moved source: ${source.sourceName}`);
      } else {
        await prisma.eventSource.delete({
          where: { id: source.id },
        });
        logger.info(`  Deleted duplicate source: ${source.sourceName}`);
      }
    }

    // 2. Merge images (keep unique ones)
    if (duplicate.images.length > 0) {
      logger.info('\n2. Merging images...');
      const allImages = [...new Set([...canonical.images, ...duplicate.images])];
      if (allImages.length > canonical.images.length) {
        await prisma.event.update({
          where: { id: canonical.id },
          data: { images: allImages },
        });
        logger.info(`  Added ${allImages.length - canonical.images.length} new images`);
      }
    }

    // 3. Create duplicate relationship
    logger.info('\n3. Creating duplicate relationship...');
    await prisma.eventDuplicate.create({
      data: {
        canonicalEventId: canonical.id,
        duplicateEventId: duplicate.id,
        similarityScore: 0.95,
      },
    });

    // 4. Mark duplicate as MERGED
    logger.info('\n4. Marking duplicate as MERGED...');
    await prisma.event.update({
      where: { id: duplicate.id },
      data: { status: 'MERGED' },
    });

    logger.info('\n✓ Merge completed successfully!');
    logger.info(`\nCanonical event URL: http://localhost:6100/events/${canonical.id}`);
    logger.info(`Merged event (now hidden): http://localhost:6100/events/${duplicate.id}`);

  } catch (error: any) {
    logger.error(`Error: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get event IDs from command line or use defaults
const eventId1 = process.argv[2] || '6134e472-8b4a-4001-a1d3-fe08d106643b';
const eventId2 = process.argv[3] || '4e433b45-3e92-43ea-85c5-e39397c1f915';

logger.info(`Merging events: ${eventId1} and ${eventId2}`);

mergeEvents(eventId1, eventId2)
  .then(() => {
    logger.info('\nScript completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
