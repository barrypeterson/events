import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from './logger';

// Initialize Anthropic client
export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

/**
 * Generate text completion using Claude
 */
export async function generateCompletion(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  } = {}
): Promise<string> {
  const {
    model = 'claude-3-5-sonnet-20241022',
    maxTokens = 1024,
    temperature = 0.7,
    systemPrompt,
  } = options;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }

    throw new Error('Unexpected response type from Claude');
  } catch (error) {
    logger.error('Claude API error:', error);
    throw new Error('Failed to generate completion with Claude');
  }
}

/**
 * Extract structured data from text using Claude
 */
export async function extractStructuredData<T>(
  text: string,
  schema: string,
  examples?: string
): Promise<T> {
  const systemPrompt = `You are a JSON extraction assistant. Extract structured data from the provided text according to the schema. Return only valid JSON, no additional text.

Schema:
${schema}

${examples ? `Examples:\n${examples}` : ''}`;

  try {
    const response = await generateCompletion(text, {
      systemPrompt,
      temperature: 0.3,
      maxTokens: 2048,
    });

    return JSON.parse(response) as T;
  } catch (error) {
    logger.error('Failed to extract structured data:', error);
    throw new Error('Failed to extract structured data');
  }
}

/**
 * Classify event category using Claude
 */
export async function classifyEventCategory(
  eventTitle: string,
  eventDescription?: string
): Promise<string[]> {
  const text = `Title: ${eventTitle}\n${eventDescription ? `Description: ${eventDescription}` : ''}`;

  const systemPrompt = `You are an event categorization assistant. Analyze the event and return relevant categories from this list:
MUSIC, COMEDY, THEATER, SPORTS, FOOD_WINE, ARTS, COMMUNITY, FAMILY, OUTDOOR, FITNESS, EDUCATION, BUSINESS, OTHER

Return a JSON array of categories (1-3 most relevant). Example: ["MUSIC", "OUTDOOR"]`;

  try {
    const response = await generateCompletion(text, {
      systemPrompt,
      temperature: 0.3,
      maxTokens: 100,
    });

    return JSON.parse(response) as string[];
  } catch (error) {
    logger.error('Failed to classify event category:', error);
    return ['OTHER'];
  }
}

/**
 * Generate event summary using Claude
 */
export async function generateEventSummary(
  eventTitle: string,
  eventDescription: string
): Promise<string> {
  const prompt = `Title: ${eventTitle}\n\nDescription: ${eventDescription}`;

  const systemPrompt = `You are an event summarization assistant. Create a concise, engaging 1-2 sentence summary of the event. Focus on the most important and interesting details.`;

  try {
    return await generateCompletion(prompt, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 200,
    });
  } catch (error) {
    logger.error('Failed to generate event summary:', error);
    return eventDescription.slice(0, 200);
  }
}
