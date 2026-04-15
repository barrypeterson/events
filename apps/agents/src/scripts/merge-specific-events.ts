import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '@slo-events/database';
import { logger } from '../lib/scraper-utils';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function mergeEvents() {
  try {
    const canonicalId = '7ca4c67f-91f3-4ffa-b33f-b358574b1185'; // Has the full title
    const duplicateId = '1c233805-5c2b-4211-bac5-b3c9676d603b'; // Shorter title

    logger.info('Merging duplicate events...');
    logger.info(`  Canonical: ${canonicalId}`);
    logger.info(`  Duplicate: ${duplicateId}`);

    // Get both events
    const [canonical, duplicate] = await Promise.all([
      prisma.event.findUnique({
        where: { id: canonicalId },
        include: { sources: true },
      }),
      prisma.event.findUnique({
        where: { id: duplicateId },
        include: { sources: true },
      }),
    ]);

    if (!canonical || !duplicate) {
      throw new Error('One or both events not found');
    }

    logger.info(`\nCanonical event: "${canonical.title}"`);
    logger.info(`Duplicate event: "${duplicate.title}"`);

    // 1. Move all sources from duplicate to canonical
    logger.info('\n1. Moving sources...');
    for (const source of duplicate.sources) {
      // Check if this source URL already exists on canonical
      const existingSource = canonical.sources.find(
        (s) => s.sourceUrl === source.sourceUrl && s.sourceName === source.sourceName
      );

      if (!existingSource) {
        await prisma.eventSource.update({
          where: { id: source.id },
          data: { eventId: canonicalId },
        });
        logger.info(`  Moved source: ${source.sourceName}`);
      } else {
        // Delete duplicate source
        await prisma.eventSource.delete({
          where: { id: source.id },
        });
        logger.info(`  Deleted duplicate source: ${source.sourceName}`);
      }
    }

    // 2. Create duplicate relationship
    logger.info('\n2. Creating duplicate relationship...');
    await prisma.eventDuplicate.create({
      data: {
        canonicalEventId: canonicalId,
        duplicateEventId: duplicateId,
        similarityScore: 0.95, // Very high similarity
      },
    });
    logger.info('  Duplicate relationship created');

    // 3. Mark duplicate event as MERGED
    logger.info('\n3. Marking duplicate as MERGED...');
    await prisma.event.update({
      where: { id: duplicateId },
      data: { status: 'MERGED' },
    });
    logger.info('  Event marked as MERGED');

    logger.info('\n✓ Merge completed successfully!');
    logger.info(`\nCanonical event URL: http://localhost:6100/events/${canonicalId}`);
  } catch (error: any) {
    logger.error(`Error: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
mergeEvents()
  .then(() => {
    logger.info('\nScript completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
