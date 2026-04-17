import { prisma, Prisma } from '@slo-events/database';
import { NormalizedEvent, DuplicateResult, SimilaritySearchOptions } from '../types';
import { logger } from './scraper-utils';
import {
  getCanonicalEventId,
  matchRecurringPattern,
  extractRecurringPattern,
  generateRecurringSeriesId,
} from './event-utils';

/**
 * Deduplicate event using pgvector similarity search
 * Returns existing event ID if duplicate, or creates new event
 */
export async function deduplicateEvent(
  event: NormalizedEvent,
  embedding: number[]
): Promise<DuplicateResult> {
  try {
    if (!event.venueId) {
      throw new Error('Event must have venueId before deduplication');
    }

    logger.debug(`Deduplicating event: ${event.title} at ${event.venueName}`);

    // STEP 0: Check if this event matches a recurring pattern (PREVENTION)
    const recurringMatch = await matchRecurringPattern(event.title, event.venueId);

    if (recurringMatch.matched && recurringMatch.confidence >= 0.7) {
      event.isRecurring = true;
      const pattern = extractRecurringPattern(event.title);
      event.recurringSeriesId = generateRecurringSeriesId(
        pattern,
        event.venueId,
        recurringMatch.pattern?.frequency || 'unknown'
      );

      logger.info(`Event matches recurring pattern (${recurringMatch.confidence.toFixed(2)} confidence)`, {
        title: event.title,
        pattern: recurringMatch.pattern?.pattern || 'keyword-based',
        seriesId: event.recurringSeriesId,
      });

      // Check if we already have an event in this recurring series for this date
      const existingInSeries = await prisma.event.findFirst({
        where: {
          recurringSeriesId: event.recurringSeriesId,
          startDateTime: {
            gte: new Date(event.startDateTime.getTime() - 24 * 60 * 60 * 1000), // Within 24 hours
            lte: new Date(event.startDateTime.getTime() + 24 * 60 * 60 * 1000),
          },
          status: 'ACTIVE',
        },
      });

      if (existingInSeries) {
        logger.info(`Found existing event in recurring series, updating`, {
          existingId: existingInSeries.id,
          seriesId: event.recurringSeriesId,
        });
        await updateEvent(existingInSeries.id, event);

        return {
          isDuplicate: true,
          eventId: existingInSeries.id,
          similarityScore: 1.0,
          action: 'update',
          matchPath: 'recurring',
        };
      }
    }

    // Step 1: EXACT TIME MATCH - same venue + exact same start time = duplicate
    // Two events at the same venue starting at exactly the same time are almost certainly duplicates
    // even if titles differ (e.g., "Sue & Jordan" vs "Sue & Jordan Live Music")
    const exactTimeMatch = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      normalized_title: string;
    }>>`
      SELECT id, title, normalized_title
      FROM events
      WHERE venue_id = ${event.venueId}::uuid
      AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
      AND status = 'ACTIVE'
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (exactTimeMatch.length > 0) {
      const existing = exactTimeMatch[0];

      // Check if this event was merged - if so, use canonical event
      const canonicalId = await getCanonicalEventId(existing.id);

      if (canonicalId !== existing.id) {
        logger.info(`Event ${existing.id} was merged into ${canonicalId}, using canonical event`);
        await updateEvent(canonicalId, event);

        return {
          isDuplicate: true,
          eventId: canonicalId,
          similarityScore: 1.0,
          action: 'update',
          matchPath: 'merged-canonical',
        };
      }

      logger.info(`Found exact time match for "${event.title}" -> "${existing.title}" (same venue, same time) - updating existing event ${existing.id}`);
      await updateEvent(existing.id, event);

      // Record that this event has multiple sources (use upsert to avoid duplicate errors)
      await prisma.eventSource.upsert({
        where: {
          eventId_sourceUrl: {
            eventId: existing.id,
            sourceUrl: event.sourceUrl,
          },
        },
        create: {
          eventId: existing.id,
          sourceUrl: event.sourceUrl,
          sourceName: event.sourceName,
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
        update: {
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
      });

      return {
        isDuplicate: true,
        eventId: existing.id,
        similarityScore: 1.0,
        action: 'update',
        matchPath: 'exact-time',
      };
    }

    // Step 2: CROSS-VENUE MATCH - identical title + exact same time at nearby/same location
    // Handles case where same event is listed under different venue names for the same physical location
    // (e.g., "Cal Poly Arts" vs "Performing Arts Center SLO" - both at 1 Grand Ave)
    const crossVenueMatch = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      venue_name: string;
      distance_meters: number;
    }>>`
      SELECT e.id, e.title, v.name as venue_name,
             CASE
               WHEN v1.latitude IS NOT NULL AND v1.longitude IS NOT NULL
                 AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
               THEN (
                 6371000 * acos(
                   LEAST(1.0, GREATEST(-1.0,
                     cos(radians(v1.latitude)) * cos(radians(v.latitude)) *
                     cos(radians(v.longitude) - radians(v1.longitude)) +
                     sin(radians(v1.latitude)) * sin(radians(v.latitude))
                   ))
                 )
               )
               ELSE 999999
             END as distance_meters
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      JOIN venues v1 ON v1.id = ${event.venueId}::uuid
      WHERE e.venue_id != ${event.venueId}::uuid
      AND similarity(e.normalized_title, ${event.normalizedTitle}) > 0.95
      AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - ${event.startDateTime}::timestamptz)) / 60) <= 1
      AND e.status = 'ACTIVE'
      AND (
        -- Only consider if venues are within 100m of each other
        CASE
          WHEN v1.latitude IS NOT NULL AND v1.longitude IS NOT NULL
            AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
          THEN (
            6371000 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(v1.latitude)) * cos(radians(v.latitude)) *
                cos(radians(v.longitude) - radians(v1.longitude)) +
                sin(radians(v1.latitude)) * sin(radians(v.latitude))
              ))
            )
          ) < 100
          ELSE false
        END
      )
      ORDER BY distance_meters ASC, e.created_at ASC
      LIMIT 1
    `;

    if (crossVenueMatch.length > 0) {
      const existing = crossVenueMatch[0];
      logger.info(`Found cross-venue match for "${event.title}" -> "${existing.title}" at ${existing.venue_name} (${existing.distance_meters.toFixed(0)}m away, same time, identical title) - updating existing event ${existing.id}`);
      await updateEvent(existing.id, event);

      // Record that this event has multiple sources (use upsert to avoid duplicate errors)
      await prisma.eventSource.upsert({
        where: {
          eventId_sourceUrl: {
            eventId: existing.id,
            sourceUrl: event.sourceUrl,
          },
        },
        create: {
          eventId: existing.id,
          sourceUrl: event.sourceUrl,
          sourceName: event.sourceName,
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
        update: {
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
      });

      return {
        isDuplicate: true,
        eventId: existing.id,
        similarityScore: 1.0,
        action: 'update',
        matchPath: 'cross-venue',
      };
    }

    // Step 3: CORE WORDS + TIME PROXIMITY - same venue + core words + times close together = duplicate
    // This handles cases like "Sweet Spots Dance Party" vs "Sweet Spots - Free Afternoon Dance Party"
    // BUT we need time proximity to avoid matching recurring events (e.g., "Santa Visits" on Dec 5 vs Dec 6)
    const stopWords = new Set(['at', 'the', 'and', 'with', 'live', 'night', 'show', 'event', 'concert', 'series', 'music', 'free', 'afternoon', 'evening', 'morning']);
    const coreWords = event.normalizedTitle
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 3); // First 3 significant words

    if (coreWords.length >= 2) {
      // Build a pattern that matches events with same core words (in any order)
      const coreWordPattern = coreWords.join('.*'); // Regex pattern: word1.*word2.*word3

      const coreWordMatch = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        normalized_title: string;
      }>>`
        SELECT id, title, normalized_title
        FROM events
        WHERE venue_id = ${event.venueId}::uuid
        AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) <= 8
        AND normalized_title ~ ${coreWordPattern}
        AND status = 'ACTIVE'
        ORDER BY created_at ASC
        LIMIT 1
      `;

      if (coreWordMatch.length > 0) {
        const existing = coreWordMatch[0];
        logger.info(`Found core words match for "${event.title}" -> "${existing.title}" (same venue, same date, within 8 hours, core: [${coreWords.join(', ')}]) - updating existing event ${existing.id}`);
        await updateEvent(existing.id, event);

        // Record that this event has multiple sources
        try {
          await prisma.eventSource.create({
            data: {
              eventId: existing.id,
              sourceUrl: event.metadata?.sourceUrl || '',
              sourceName: event.metadata?.source || '',
              scrapedAt: new Date(),
            },
          });
        } catch (error) {
          // Ignore if source already exists
        }

        return {
          isDuplicate: true,
          eventId: existing.id,
          similarityScore: 0.9,
          action: 'update',
          matchPath: 'core-words',
        };
      }
    }

    // Step 4: FUZZY TITLE matching - same venue + same date + title similarity = duplicate
    // Search for events at SAME VENUE on SAME DATE with similar title
    // This prevents events at different venues from being incorrectly merged
    const fuzzyMatch = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      normalized_title: string;
      similarity: number;
    }>>`
      SELECT id, title, normalized_title,
             similarity(normalized_title, ${event.normalizedTitle}) as similarity
      FROM events
      WHERE venue_id = ${event.venueId}::uuid
      AND ABS(EXTRACT(EPOCH FROM (start_datetime - ${event.startDateTime}::timestamptz)) / 3600) < 6
      AND similarity(normalized_title, ${event.normalizedTitle}) > 0.7
      AND status = 'ACTIVE'
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (fuzzyMatch.length > 0) {
      const existing = fuzzyMatch[0];
      logger.info(`Found fuzzy match for "${event.title}" -> "${existing.title}" - updating existing event ${existing.id}`);
      await updateEvent(existing.id, event);

      // Record that this event has multiple sources (use upsert to avoid duplicate errors)
      await prisma.eventSource.upsert({
        where: {
          eventId_sourceUrl: {
            eventId: existing.id,
            sourceUrl: event.sourceUrl,
          },
        },
        create: {
          eventId: existing.id,
          sourceUrl: event.sourceUrl,
          sourceName: event.sourceName,
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
        update: {
          scrapedAt: new Date(),
          rawData: event.rawData as any,
        },
      });

      return {
        isDuplicate: true,
        eventId: existing.id,
        similarityScore: 1.0,
        action: 'update',
        matchPath: 'fuzzy-title',
      };
    }

    // Step 5: VECTOR SIMILARITY - AI-based semantic matching as final fallback
    // Only compare with events at the SAME VENUE to prevent incorrect merges
    const similar = await findSimilarEvents(embedding, {
      threshold: 0.85, // High threshold for vector similarity auto-merge
      limit: 5,
      timeWindow: 48,
      venueId: event.venueId, // Only match events at same venue
    });

    if (similar.length === 0) {
      // No duplicates found, create new event
      logger.info(`No duplicates found, creating new event: ${event.title}`);
      const created = await createEvent(event, embedding);
      return {
        isDuplicate: false,
        eventId: created.id,
        action: 'create',
        matchPath: 'new',
      };
    }

    // Check highest similarity match
    const best = similar[0];
    const similarityScore = best.similarity;

    // Auto-merge if similarity >= 0.85 (already filtered by findSimilarEvents)
    if (similarityScore >= 0.85) {
      logger.info(
        `High similarity (${similarityScore.toFixed(3)}), merging with event ${best.id}`
      );

      await updateEvent(best.id, event);
      await recordDuplicate(best.id, best.id, similarityScore);

      return {
        isDuplicate: true,
        eventId: best.id,
        similarityScore,
        action: 'merge',
        matchPath: 'vector-similarity',
      };
    }

    // This shouldn't happen since we filtered by threshold, but just in case
    // Similarity < 0.85, create new event
    logger.info(`Similarity below threshold (${similarityScore.toFixed(3)}), creating new event`);
    const created = await createEvent(event, embedding);

    return {
      isDuplicate: false,
      eventId: created.id,
      action: 'create',
      matchPath: 'new',
    };
  } catch (error: any) {
    logger.error(`Deduplication failed for ${event.title}: ${error.message}`);
    throw new Error(`Deduplication failed: ${error.message}`);
  }
}

/**
 * Find similar events using pgvector cosine similarity
 */
async function findSimilarEvents(
  embedding: number[],
  options: SimilaritySearchOptions
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  const { threshold, limit, timeWindow, venueId } = options;

  try {
    // Build WHERE conditions
    const conditions: string[] = ['status = \'ACTIVE\'']; // Only match active events
    const params: any[] = [embedding, limit];

    if (venueId) {
      conditions.push(`venue_id = $${params.length + 1}::uuid`);
      params.push(venueId);
    }

    if (timeWindow) {
      const hours = timeWindow;
      conditions.push(`start_datetime BETWEEN NOW() - INTERVAL '${hours} hours' AND NOW() + INTERVAL '${hours} hours'`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // pgvector similarity search using cosine distance
    // Note: Using <=> operator for cosine distance, lower is better
    // Convert to similarity: 1 - distance
    const query = `
      SELECT
        id,
        title,
        1 - (embedding <=> $1::vector) as similarity
      FROM events
      ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    const results = await prisma.$queryRawUnsafe<
      Array<{ id: string; title: string; similarity: number }>
    >(query, ...params);

    // Filter by threshold
    const filtered = results.filter((r) => r.similarity >= threshold);

    logger.debug(
      `Found ${filtered.length} similar events (threshold: ${threshold})`
    );

    return filtered;
  } catch (error: any) {
    logger.error(`Similarity search failed: ${error.message}`);
    return [];
  }
}

/**
 * Create new event in database
 */
async function createEvent(
  event: NormalizedEvent,
  embedding: number[]
): Promise<{ id: string }> {
  try {
    // Don't save events in the past
    if (event.startDateTime < new Date()) {
      logger.warn(`Skipping past event: ${event.title} (${event.startDateTime})`);
      throw new Error('Event is in the past');
    }

    // Use $queryRaw since Prisma create() seems to have issues
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO events (
        title, normalized_title, description, start_datetime, end_datetime,
        timezone, venue_id, category, tags, images, ticket_url,
        price_min, price_max, is_free, age_restriction, embedding,
        is_recurring, recurring_series_id,
        status, confidence_score, updated_at
      ) VALUES (
        ${event.title},
        ${event.normalizedTitle},
        ${event.description},
        ${event.startDateTime},
        ${event.endDateTime},
        ${event.timezone},
        ${event.venueId}::uuid,
        ${event.category}::event_category[],
        ${event.tags}::varchar[],
        ${event.images}::text[],
        ${event.ticketUrl},
        ${event.priceMin},
        ${event.priceMax},
        ${event.isFree},
        ${event.ageRestriction},
        ${embeddingStr}::vector,
        ${event.isRecurring || false},
        ${event.recurringSeriesId}::uuid,
        'ACTIVE'::event_status,
        ${event.confidenceScore || 0.9},
        NOW()
      )
      RETURNING id
    `;

    const created = result[0];

    // Create event source record
    await prisma.eventSource.create({
      data: {
        eventId: created.id,
        sourceUrl: event.sourceUrl,
        sourceName: event.sourceName,
        rawData: event.rawData as Prisma.JsonObject,
      },
    });

    logger.info(`Created new event: ${created.title} (${created.id})`);
    return { id: created.id };
  } catch (error: any) {
    logger.error(`Failed to create event: ${error.message}`);
    throw error;
  }
}

/**
 * Update existing event with new data
 */
async function updateEvent(eventId: string, event: NormalizedEvent): Promise<void> {
  try {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        title: event.title,
        normalizedTitle: event.normalizedTitle,
        description: event.description,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        images: event.images,
        ticketUrl: event.ticketUrl,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        isFree: event.isFree,
        ageRestriction: event.ageRestriction,
        category: event.category,
        tags: event.tags,
        updatedAt: new Date(),
      },
    });

    // Add new event source
    await prisma.eventSource.upsert({
      where: {
        eventId_sourceUrl: {
          eventId,
          sourceUrl: event.sourceUrl,
        },
      },
      create: {
        eventId,
        sourceUrl: event.sourceUrl,
        sourceName: event.sourceName,
        rawData: event.rawData as Prisma.JsonObject,
      },
      update: {
        scrapedAt: new Date(),
        rawData: event.rawData as Prisma.JsonObject,
      },
    });

    logger.info(`Updated event: ${eventId}`);
  } catch (error: any) {
    logger.error(`Failed to update event ${eventId}: ${error.message}`);
    throw error;
  }
}

/**
 * Record duplicate relationship
 */
async function recordDuplicate(
  canonicalEventId: string,
  duplicateEventId: string,
  similarityScore: number
): Promise<void> {
  try {
    await prisma.eventDuplicate.upsert({
      where: {
        canonicalEventId_duplicateEventId: {
          canonicalEventId,
          duplicateEventId,
        },
      },
      create: {
        canonicalEventId,
        duplicateEventId,
        similarityScore,
      },
      update: {
        similarityScore,
        mergedAt: new Date(),
      },
    });

    logger.debug(
      `Recorded duplicate: ${canonicalEventId} <-> ${duplicateEventId} (${similarityScore.toFixed(3)})`
    );
  } catch (error: any) {
    logger.error(`Failed to record duplicate: ${error.message}`);
  }
}

/**
 * Get all duplicates for an event
 */
export async function getEventDuplicates(eventId: string) {
  return prisma.eventDuplicate.findMany({
    where: {
      OR: [{ canonicalEventId: eventId }, { duplicateEventId: eventId }],
    },
    include: {
      canonicalEvent: true,
      duplicateEvent: true,
    },
  });
}

/**
 * Get events pending manual review (flagged duplicates)
 */
export async function getPendingDuplicates() {
  return prisma.eventDuplicate.findMany({
    where: {
      similarityScore: {
        gte: 0.7,
        lte: 0.9,
      },
    },
    include: {
      canonicalEvent: true,
      duplicateEvent: true,
    },
    orderBy: {
      mergedAt: 'desc',
    },
  });
}
