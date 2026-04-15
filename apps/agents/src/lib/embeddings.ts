import OpenAI from 'openai';
import { NormalizedEvent, EmbeddingOptions } from '../types';
import { logger, chunk } from './scraper-utils';

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

/**
 * In-memory cache for embeddings (optional optimization)
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Generate embedding for a single event
 */
export async function generateEmbedding(
  event: NormalizedEvent,
  options: EmbeddingOptions = {}
): Promise<number[]> {
  const {
    model = 'text-embedding-3-large',
    dimensions = 1536,
  } = options;

  try {
    // Build text input for embedding
    const text = buildEmbeddingText(event);

    // Check cache
    const cacheKey = `${text.substring(0, 100)}-${model}`;
    if (embeddingCache.has(cacheKey)) {
      logger.debug(`Cache hit for embedding: ${event.title}`);
      return embeddingCache.get(cacheKey)!;
    }

    logger.debug(`Generating embedding for: ${event.title}`);

    const response = await getOpenAI().embeddings.create({
      model,
      input: text,
      dimensions,
    });

    const embedding = response.data[0].embedding;

    // Cache the result
    embeddingCache.set(cacheKey, embedding);

    logger.info(`Generated embedding for: ${event.title} (${embedding.length} dimensions)`);
    return embedding;
  } catch (error: any) {
    logger.error(`Failed to generate embedding for ${event.title}: ${error.message}`);
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple events in batches
 */
export async function generateEmbeddings(
  events: NormalizedEvent[],
  options: EmbeddingOptions = {}
): Promise<Map<string, number[]>> {
  const {
    model = 'text-embedding-3-large',
    dimensions = 1536,
    batchSize = 10,
  } = options;

  const results = new Map<string, number[]>();
  const batches = chunk(events, batchSize);

  logger.info(`Generating embeddings for ${events.length} events in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.debug(`Processing batch ${i + 1}/${batches.length}`);

    try {
      // Build texts for batch
      const texts = batch.map((event) => buildEmbeddingText(event));

      // Generate embeddings for batch
      const response = await getOpenAI().embeddings.create({
        model,
        input: texts,
        dimensions,
      });

      // Map results back to events
      batch.forEach((event, idx) => {
        const embedding = response.data[idx].embedding;
        results.set(event.title, embedding);

        // Cache the result
        const cacheKey = `${texts[idx].substring(0, 100)}-${model}`;
        embeddingCache.set(cacheKey, embedding);
      });

      logger.info(`Generated ${batch.length} embeddings in batch ${i + 1}`);

      // Rate limiting: wait 500ms between batches
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      logger.error(`Failed to generate batch ${i + 1}: ${error.message}`);

      // Fall back to individual generation for failed batch
      for (const event of batch) {
        try {
          const embedding = await generateEmbedding(event, { model, dimensions });
          results.set(event.title, embedding);
        } catch (err: any) {
          logger.error(`Failed to generate embedding for ${event.title}: ${err.message}`);
        }
      }
    }
  }

  logger.info(`Successfully generated ${results.size}/${events.length} embeddings`);
  return results;
}

/**
 * Build text input for embedding generation
 */
function buildEmbeddingText(event: NormalizedEvent): string {
  const parts = [
    event.title,
    event.description || '',
    event.venueName,
    ...(event.category || []),
    ...(event.tags || []),
  ];

  // Include price context
  if (event.isFree) {
    parts.push('free admission');
  } else if (event.priceMin !== undefined) {
    parts.push(`price: $${event.priceMin}`);
  }

  // Include age restriction
  if (event.ageRestriction) {
    parts.push(event.ageRestriction);
  }

  return parts
    .filter(Boolean)
    .join(' ')
    .substring(0, 8000); // OpenAI token limit
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  logger.info('Embedding cache cleared');
}

/**
 * Get cache statistics
 */
export function getEmbeddingCacheStats(): { size: number } {
  return {
    size: embeddingCache.size,
  };
}
