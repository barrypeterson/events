import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { generateEmbedding } from '../lib/openai';
import { EventWithVenue, SearchResult } from '../types';
import { getCache, setCache, CACHE_TTL } from '../lib/redis';

/**
 * Perform vector similarity search for events
 */
export async function searchEventsBySimilarity(
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    category?: string[];
    startDate?: Date;
    endDate?: Date;
  }
): Promise<SearchResult<EventWithVenue>[]> {
  try {
    const {
      limit = 20,
      threshold = 0.7,
      category,
      startDate,
      endDate,
    } = options || {};

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Build WHERE conditions
    const conditions: string[] = ['status = \'ACTIVE\''];

    if (category && category.length > 0) {
      const categoryList = category.map((c) => `'${c}'`).join(',');
      conditions.push(`category && ARRAY[${categoryList}]::event_category[]`);
    }

    if (startDate) {
      conditions.push(`start_datetime >= '${startDate.toISOString()}'`);
    }

    if (endDate) {
      conditions.push(`start_datetime <= '${endDate.toISOString()}'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Perform vector similarity search using pgvector
    const results = await prisma.$queryRaw<any[]>`
      SELECT
        e.*,
        v.id as "venue_id",
        v.name as "venue_name",
        v.normalized_name as "venue_normalized_name",
        v.address as "venue_address",
        v.city as "venue_city",
        v.state as "venue_state",
        v.zip_code as "venue_zip_code",
        v.latitude as "venue_latitude",
        v.longitude as "venue_longitude",
        v.website as "venue_website",
        v.phone as "venue_phone",
        v.venue_type as "venue_venue_type",
        v.metadata as "venue_metadata",
        v.created_at as "venue_created_at",
        v.updated_at as "venue_updated_at",
        1 - (e.embedding <=> ${queryEmbedding}::vector) as similarity
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      ${whereClause}
      ORDER BY e.embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;

    // Filter by threshold and transform results
    const searchResults: SearchResult<EventWithVenue>[] = results
      .filter((row) => row.similarity >= threshold)
      .map((row) => ({
        item: {
          id: row.id,
          title: row.title,
          normalizedTitle: row.normalized_title,
          description: row.description,
          startDateTime: row.start_datetime,
          endDateTime: row.end_datetime,
          timezone: row.timezone,
          venueId: row.venue_id,
          category: row.category,
          tags: row.tags,
          images: row.images,
          ticketUrl: row.ticket_url,
          priceMin: row.price_min,
          priceMax: row.price_max,
          isFree: row.is_free,
          ageRestriction: row.age_restriction,
          embedding: row.embedding,
          isRecurring: row.is_recurring,
          recurringPattern: row.recurring_pattern,
          recurringSeriesId: row.recurring_series_id,
          confidenceScore: row.confidence_score,
          status: row.status,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          venue: {
            id: row.venue_id,
            name: row.venue_name,
            normalizedName: row.venue_normalized_name,
            address: row.venue_address,
            city: row.venue_city,
            state: row.venue_state,
            zipCode: row.venue_zip_code,
            latitude: row.venue_latitude,
            longitude: row.venue_longitude,
            website: row.venue_website,
            phone: row.venue_phone,
            venueType: row.venue_venue_type,
            embedding: null,
            imageUrl: row.venue_image_url || null,
            metadata: row.venue_metadata,
            createdAt: row.venue_created_at,
            updatedAt: row.venue_updated_at,
          },
        } as EventWithVenue,
        score: row.similarity,
      }));

    logger.info('Vector search completed', {
      query,
      resultsCount: searchResults.length,
    });

    return searchResults;
  } catch (error) {
    logger.error('Vector search error:', error);
    throw new Error('Failed to perform vector search');
  }
}

/**
 * Find similar events to a given event
 */
export async function findSimilarEvents(
  eventId: string,
  options?: {
    limit?: number;
    threshold?: number;
  }
): Promise<SearchResult<EventWithVenue>[]> {
  try {
    const { limit = 10, threshold = 0.8 } = options || {};

    // Check cache first
    const cacheKey = `similar:${eventId}:${limit}:${threshold}`;
    const cached = await getCache<SearchResult<EventWithVenue>[]>(cacheKey);
    if (cached) {
      logger.debug('Returning cached similar events', { eventId });
      return cached;
    }

    // Get the event's embedding
    const event = await prisma.$queryRaw<any[]>`
      SELECT embedding FROM events WHERE id = ${eventId}::uuid
    `;

    if (!event || event.length === 0) {
      return [];
    }

    const eventEmbedding = event[0].embedding;

    // Find similar events
    const results = await prisma.$queryRaw<any[]>`
      SELECT
        e.*,
        v.id as "venue_id",
        v.name as "venue_name",
        v.normalized_name as "venue_normalized_name",
        v.address as "venue_address",
        v.city as "venue_city",
        v.state as "venue_state",
        v.zip_code as "venue_zip_code",
        v.latitude as "venue_latitude",
        v.longitude as "venue_longitude",
        v.website as "venue_website",
        v.phone as "venue_phone",
        v.venue_type as "venue_venue_type",
        v.metadata as "venue_metadata",
        v.created_at as "venue_created_at",
        v.updated_at as "venue_updated_at",
        1 - (e.embedding <=> ${eventEmbedding}::vector) as similarity
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.id != ${eventId}::uuid
        AND e.status = 'ACTIVE'
      ORDER BY e.embedding <=> ${eventEmbedding}::vector
      LIMIT ${limit}
    `;

    // Filter by threshold and transform results
    const searchResults: SearchResult<EventWithVenue>[] = results
      .filter((row) => row.similarity >= threshold)
      .map((row) => ({
        item: {
          id: row.id,
          title: row.title,
          normalizedTitle: row.normalized_title,
          description: row.description,
          startDateTime: row.start_datetime,
          endDateTime: row.end_datetime,
          timezone: row.timezone,
          venueId: row.venue_id,
          category: row.category,
          tags: row.tags,
          images: row.images,
          ticketUrl: row.ticket_url,
          priceMin: row.price_min,
          priceMax: row.price_max,
          isFree: row.is_free,
          ageRestriction: row.age_restriction,
          embedding: row.embedding,
          isRecurring: row.is_recurring,
          recurringPattern: row.recurring_pattern,
          recurringSeriesId: row.recurring_series_id,
          confidenceScore: row.confidence_score,
          status: row.status,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          venue: {
            id: row.venue_id,
            name: row.venue_name,
            normalizedName: row.venue_normalized_name,
            address: row.venue_address,
            city: row.venue_city,
            state: row.venue_state,
            zipCode: row.venue_zip_code,
            latitude: row.venue_latitude,
            longitude: row.venue_longitude,
            website: row.venue_website,
            phone: row.venue_phone,
            venueType: row.venue_venue_type,
            embedding: null,
            imageUrl: row.venue_image_url || null,
            metadata: row.venue_metadata,
            createdAt: row.venue_created_at,
            updatedAt: row.venue_updated_at,
          },
        } as EventWithVenue,
        score: row.similarity,
      }));

    // Cache results
    await setCache(cacheKey, searchResults, CACHE_TTL.MEDIUM);

    logger.info('Similar events found', {
      eventId,
      resultsCount: searchResults.length,
    });

    return searchResults;
  } catch (error) {
    logger.error('Find similar events error:', error);
    throw new Error('Failed to find similar events');
  }
}

/**
 * Hybrid search combining text and vector search
 */
export async function hybridSearch(
  query: string,
  options?: {
    limit?: number;
    category?: string[];
    startDate?: Date;
    endDate?: Date;
  }
): Promise<EventWithVenue[]> {
  try {
    const { limit = 20, category, startDate, endDate } = options || {};

    // Perform both text and vector searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      searchEventsBySimilarity(query, {
        limit: Math.ceil(limit / 2),
        threshold: 0.6,
        category,
        startDate,
        endDate,
      }),
      searchEventsByText(query, {
        limit: Math.ceil(limit / 2),
        category,
        startDate,
        endDate,
      }),
    ]);

    // Combine and deduplicate results
    const eventMap = new Map<string, EventWithVenue>();

    vectorResults.forEach((result) => {
      eventMap.set(result.item.id, result.item);
    });

    textResults.forEach((event) => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    const results = Array.from(eventMap.values()).slice(0, limit);

    logger.info('Hybrid search completed', {
      query,
      resultsCount: results.length,
    });

    return results;
  } catch (error) {
    logger.error('Hybrid search error:', error);
    throw new Error('Failed to perform hybrid search');
  }
}

/**
 * Text-based search using PostgreSQL full-text search
 */
async function searchEventsByText(
  query: string,
  options?: {
    limit?: number;
    category?: string[];
    startDate?: Date;
    endDate?: Date;
  }
): Promise<EventWithVenue[]> {
  const { limit = 20, category, startDate, endDate } = options || {};

  const conditions: string[] = ['e.status = \'ACTIVE\''];

  if (category && category.length > 0) {
    const categoryList = category.map((c) => `'${c}'`).join(',');
    conditions.push(`e.category && ARRAY[${categoryList}]::event_category[]`);
  }

  if (startDate) {
    conditions.push(`e.start_datetime >= '${startDate.toISOString()}'`);
  }

  if (endDate) {
    conditions.push(`e.start_datetime <= '${endDate.toISOString()}'`);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const results = await prisma.$queryRaw<any[]>`
    SELECT e.*, v.*
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE (
      e.title ILIKE ${`%${query}%`}
      OR e.description ILIKE ${`%${query}%`}
      OR v.name ILIKE ${`%${query}%`}
    )
    ${whereClause}
    ORDER BY e.start_datetime ASC
    LIMIT ${limit}
  `;

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    normalizedTitle: row.normalized_title,
    description: row.description,
    startDateTime: row.start_datetime,
    endDateTime: row.end_datetime,
    timezone: row.timezone,
    venueId: row.venue_id,
    category: row.category,
    tags: row.tags,
    images: row.images,
    ticketUrl: row.ticket_url,
    priceMin: row.price_min,
    priceMax: row.price_max,
    isFree: row.is_free,
    ageRestriction: row.age_restriction,
    embedding: row.embedding,
    isRecurring: row.is_recurring,
    recurringPattern: row.recurring_pattern,
    recurringSeriesId: row.recurring_series_id,
    confidenceScore: row.confidence_score,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      normalizedName: row.venue_normalized_name,
      address: row.venue_address,
      city: row.venue_city,
      state: row.venue_state,
      zipCode: row.venue_zip_code,
      latitude: row.venue_latitude,
      longitude: row.venue_longitude,
      website: row.venue_website,
      phone: row.venue_phone,
      venueType: row.venue_venue_type,
      embedding: null,
      imageUrl: row.venue_image_url || null,
      metadata: row.venue_metadata,
      createdAt: row.venue_created_at,
      updatedAt: row.venue_updated_at,
    },
  })) as EventWithVenue[];
}
