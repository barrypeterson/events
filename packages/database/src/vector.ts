import { EventStatus, PrismaClient } from '@prisma/client';

// Lazy-load prisma to avoid circular dependency
function getPrisma(): PrismaClient {
  // This will be resolved at runtime after index.ts has fully initialized
  return require('./index').prisma;
}

export interface SimilarEvent {
  id: string;
  title: string;
  venueId: string;
  startDateTime: Date;
  similarity: number;
}

export interface SimilarVenue {
  id: string;
  name: string;
  city: string | null;
  similarity: number;
}

/**
 * Find events similar to the given embedding using pgvector
 * Uses optimized vector search with cosine distance
 */
export async function findSimilarEvents(
  embedding: number[],
  options?: {
    limit?: number;
    minSimilarity?: number;
    excludeEventIds?: string[];
    startAfter?: Date;
  }
): Promise<SimilarEvent[]> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.7;
  const excludeIds = options?.excludeEventIds ?? [];

  // Convert embedding array to PostgreSQL vector format
  const embeddingStr = `[${embedding.join(',')}]`;

  const query = `
    SELECT
      id,
      title,
      venue_id as "venueId",
      start_datetime as "startDateTime",
      1 - (embedding <=> $1::vector) as similarity
    FROM events
    WHERE status = $2
      AND embedding IS NOT NULL
      ${excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.map((_, i) => `$${i + 4}`).join(',')})` : ''}
      ${options?.startAfter ? `AND start_datetime >= $3` : ''}
      AND (1 - (embedding <=> $1::vector)) >= $${options?.startAfter ? '4' : '3'}
    ORDER BY embedding <=> $1::vector
    LIMIT $${options?.startAfter ? (excludeIds.length > 0 ? excludeIds.length + 5 : '5') : (excludeIds.length > 0 ? excludeIds.length + 4 : '4')}
  `;

  const params = [
    embeddingStr,
    EventStatus.ACTIVE,
    ...(options?.startAfter ? [options.startAfter] : []),
    minSimilarity,
    ...excludeIds,
    limit,
  ];

  const prisma = getPrisma();
  const results = await prisma.$queryRawUnsafe<SimilarEvent[]>(
    query,
    ...params.slice(0, options?.startAfter ? (excludeIds.length > 0 ? excludeIds.length + 5 : 5) : (excludeIds.length > 0 ? excludeIds.length + 4 : 4))
  );

  return results;
}

/**
 * Find venues similar to the given embedding using pgvector
 */
export async function findSimilarVenues(
  embedding: number[],
  options?: {
    limit?: number;
    minSimilarity?: number;
    city?: string;
  }
): Promise<SimilarVenue[]> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.7;

  const embeddingStr = `[${embedding.join(',')}]`;

  const prisma = getPrisma();
  const results = await prisma.$queryRaw<SimilarVenue[]>`
    SELECT
      id,
      name,
      city,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM venues
    WHERE embedding IS NOT NULL
      ${options?.city ? `AND city = ${options.city}` : ''}
      AND (1 - (embedding <=> ${embeddingStr}::vector)) >= ${minSimilarity}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
  }));
}

/**
 * Calculate similarity between two events using their embeddings
 */
export async function calculateEventSimilarity(
  eventId1: string,
  eventId2: string
): Promise<number | null> {
  const prisma = getPrisma();
  const result = await prisma.$queryRaw<[{ similarity: number }]>`
    SELECT
      1 - (e1.embedding <=> e2.embedding) as similarity
    FROM events e1
    CROSS JOIN events e2
    WHERE e1.id = ${eventId1}::uuid
      AND e2.id = ${eventId2}::uuid
      AND e1.embedding IS NOT NULL
      AND e2.embedding IS NOT NULL
  `;

  return result.length > 0 ? Number(result[0].similarity) : null;
}

/**
 * Find potential duplicate events using vector similarity
 */
export async function findPotentialDuplicates(
  eventId: string,
  options?: {
    minSimilarity?: number;
    timeDeltaHours?: number;
  }
): Promise<SimilarEvent[]> {
  const minSimilarity = options?.minSimilarity ?? 0.85;
  const timeDeltaHours = options?.timeDeltaHours ?? 24;

  const prisma = getPrisma();
  const eventRows = await prisma.$queryRaw<{ embedding: string; start_datetime: Date; venue_id: string }[]>`
    SELECT embedding::text, start_datetime, venue_id FROM events WHERE id = ${eventId}::uuid LIMIT 1
  `;

  const event = eventRows[0];
  if (!event || !event.embedding) {
    return [];
  }

  // Calculate time window for potential duplicates
  const startWindow = new Date(event.start_datetime);
  startWindow.setHours(startWindow.getHours() - timeDeltaHours);

  const endWindow = new Date(event.start_datetime);
  endWindow.setHours(endWindow.getHours() + timeDeltaHours);

  const embeddingStr = event.embedding;

  const results = await prisma.$queryRaw<SimilarEvent[]>`
    SELECT
      id,
      title,
      venue_id as "venueId",
      start_datetime as "startDateTime",
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM events
    WHERE id != ${eventId}::uuid
      AND status = ${EventStatus.ACTIVE}
      AND embedding IS NOT NULL
      AND start_datetime BETWEEN ${startWindow} AND ${endWindow}
      AND venue_id = ${event.venue_id}::uuid
      AND (1 - (embedding <=> ${embeddingStr}::vector)) >= ${minSimilarity}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 10
  `;

  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
  }));
}
