import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from './logger';

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Generate embedding for text using OpenAI text-embedding-3-small
 * Returns 1536-dimensional vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('OpenAI embedding error:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    logger.error('OpenAI batch embedding error:', error);
    throw new Error('Failed to generate embeddings');
  }
}

/**
 * Create embedding text from event data
 */
export function createEmbeddingText(data: {
  title: string;
  description?: string;
  category?: string[];
  tags?: string[];
  venueName?: string;
}): string {
  const parts: string[] = [data.title];

  if (data.description) {
    parts.push(data.description);
  }

  if (data.category && data.category.length > 0) {
    parts.push(`Categories: ${data.category.join(', ')}`);
  }

  if (data.tags && data.tags.length > 0) {
    parts.push(`Tags: ${data.tags.join(', ')}`);
  }

  if (data.venueName) {
    parts.push(`Venue: ${data.venueName}`);
  }

  return parts.join('\n');
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return similarity;
}
