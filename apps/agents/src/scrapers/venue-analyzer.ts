import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
import { navigateAndExtract } from '../lib/page-utils';
import { logger } from '../lib/scraper-utils';
import type { PageAnalysis } from '../types';

const ANALYSIS_MODEL = 'gpt-4o';
const MAX_PROMPT_ATTEMPTS = 3;

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Analyze a venue's events page to learn its structure.
 * One-time expensive operation that generates an optimized extraction prompt.
 *
 * Retries prompt generation up to MAX_PROMPT_ATTEMPTS times, feeding the
 * previous failed prompt back to gpt-4o as negative feedback. This tames
 * the non-determinism where the analyzer model occasionally writes a prompt
 * that the extractor model can't execute.
 */
export async function analyzeVenue(configId: string): Promise<PageAnalysis> {
  const config = await prisma.venueScraperConfig.findUniqueOrThrow({
    where: { id: configId },
    include: { venue: true },
  });

  logger.info(`[analyze] Starting analysis of ${config.sourceName} (${config.sourceUrl})`);

  const { cleanText, status } = await navigateAndExtract(null, config.sourceUrl, null, {
    useProxy: config.requiresProxy,
    onProxyEscalation: async () => {
      logger.warn(`[analyze] ${config.sourceName}: marking requiresProxy=true (direct blocked, proxy succeeded)`);
      await prisma.venueScraperConfig.update({
        where: { id: configId },
        data: { requiresProxy: true, proxyEscalatedAt: new Date() },
      });
    },
  });

  if (status >= 400) {
    throw new Error(`Page returned ${status} for ${config.sourceUrl}`);
  }

  if (cleanText.length < 100) {
    throw new Error(`Page has no meaningful content (${cleanText.length} chars)`);
  }

  logger.info(`[analyze] ${config.sourceName}: ${cleanText.length} chars clean text, status ${status}`);
  // Log the head of cleanText so we can confirm the model is being fed the
  // same event-block format we see locally, not something mangled by proxy
  // / encoding / compression differences on Railway.
  const cleanHead = cleanText.slice(0, 1500).replace(/\s+/g, ' ');
  logger.info(`[analyze] ${config.sourceName} clean_text_head="${cleanHead}"`);

  const client = getOpenAI();
  const previousFailures: Array<{ prompt: string; extracted: number; expected: number }> = [];
  let analysis: PageAnalysis | null = null;
  let validationCount = 0;

  for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
    const candidate = await generateAnalysis(
      client,
      config.sourceUrl,
      config.venue.name,
      cleanText,
      previousFailures,
      attempt,
    );

    // Log the FULL generated prompt (truncated at 2000 chars) so we can
    // inspect exactly what gpt-4o produced, not just the first ~200.
    logger.info(
      `[analyze] ${config.sourceName} attempt=${attempt} generated_prompt_len=${candidate.extractionPrompt.length} pageType=${candidate.pageType} samples=${candidate.sampleEventCount}`,
    );
    logger.info(
      `[analyze] ${config.sourceName} attempt=${attempt} generated_prompt="${candidate.extractionPrompt.slice(0, 2000)}"`,
    );

    const validation = await runValidation(client, candidate.extractionPrompt, cleanText);
    const extractedCount = validation.count;
    const minExpected = Math.max(1, Math.floor(candidate.sampleEventCount * 0.5));
    const passed = candidate.sampleEventCount === 0 || extractedCount >= minExpected;

    logger.info(
      `[analyze] ${config.sourceName} attempt=${attempt} validation=${extractedCount} min=${minExpected} prompt_tokens=${validation.promptTokens} completion_tokens=${validation.completionTokens} finish=${validation.finishReason} response_chars=${validation.rawText.length} parseError=${validation.parseError ?? 'none'} passed=${passed}`,
    );

    // Log BOTH the head and tail of the response so truncated outputs are
    // visible from both sides. The tail is critical for detecting
    // finish_reason=length (ran out of tokens mid-object).
    logger.info(
      `[analyze] ${config.sourceName} attempt=${attempt} validation_response_head="${validation.rawText.slice(0, 3000)}"`,
    );
    if (validation.rawText.length > 3000) {
      logger.info(
        `[analyze] ${config.sourceName} attempt=${attempt} validation_response_tail="${validation.rawText.slice(-2000)}"`,
      );
    }

    if (passed) {
      analysis = candidate;
      validationCount = extractedCount;
      break;
    }

    previousFailures.push({
      prompt: candidate.extractionPrompt,
      extracted: extractedCount,
      expected: candidate.sampleEventCount,
    });

    logger.warn(
      `[analyze] ${config.sourceName} attempt=${attempt} REJECTED — extracted ${extractedCount}/${candidate.sampleEventCount}`,
    );
  }

  if (!analysis) {
    throw new Error(
      `Could not generate a working extraction prompt after ${MAX_PROMPT_ATTEMPTS} attempts. Last failures: ${previousFailures.map(f => `${f.extracted}/${f.expected}`).join(', ')}. The page may have an unusual structure; consider a dedicated scraper.`,
    );
  }

  await prisma.venueScraperConfig.update({
    where: { id: configId },
    data: {
      pageAnalysis: analysis as any,
      analysisModel: ANALYSIS_MODEL,
      analyzedAt: new Date(),
    },
  });

  logger.info(
    `[analyze] ${config.sourceName}: stored (validation=${validationCount}/${analysis.sampleEventCount})`,
  );
  return analysis;
}

async function generateAnalysis(
  client: OpenAI,
  sourceUrl: string,
  venueName: string,
  cleanText: string,
  previousFailures: Array<{ prompt: string; extracted: number; expected: number }>,
  attempt: number,
): Promise<PageAnalysis> {
  const today = new Date().toISOString().split('T')[0];

  const feedback = previousFailures.length
    ? `\n\nPREVIOUS ATTEMPTS FAILED. Your earlier prompts extracted far fewer events than the page contains. Write a different, more direct prompt this time — clearer field definitions, concrete examples from the actual page text, and instructions precise enough that gpt-4o-mini cannot return an empty array by accident.\n\n${previousFailures
        .map(
          (f, i) =>
            `Attempt ${i + 1}: extracted ${f.extracted}/${f.expected} events.\nPrompt was:\n"""${f.prompt}"""`,
        )
        .join('\n\n')}`
    : '';

  const analysisPrompt = `You are analyzing an events page for a venue called "${venueName}" at ${sourceUrl}.

Your job: understand how events are presented on this page, then write a compact extraction prompt that a cheaper AI model (gpt-4o-mini) can use to efficiently extract events from this page's text content on future visits.

TODAY'S DATE: ${today}

Here is the clean text content of the page:
---
${cleanText}
---
${feedback}

Respond with a JSON object (no markdown fences) with these fields:

{
  "version": 1,
  "pageDescription": "Brief description of how events appear on this page",
  "extractionPrompt": "A focused system prompt for gpt-4o-mini that tells it exactly how to extract events from this page's text. CRITICAL: The prompt MUST instruct the model to return a JSON array where each event has these fields: title, rawDate, rawTime, rawDescription, rawPrice, imageUrl (from [IMAGE: url] markers, null if none), url (from [LINK: url] markers, this should be the event detail page or ticket purchase link — NOT navigation links, ads, social media, or spam links. Only pick a link that clearly relates to the specific event. null if no relevant link found). The prompt MUST say 'Return ONLY a JSON array, no markdown, no explanations.' Include 1-2 concrete example snippets copied verbatim from the page text above so the model knows what a single event block looks like. 200-500 words max.",
  "pageType": "static" | "js-rendered" | "spa" | "infinite-scroll",
  "waitStrategy": "networkidle" | "selector" | "timeout",
  "waitValue": null or a CSS selector string or timeout in ms,
  "requiresScrolling": false,
  "sampleEventCount": number of events you can see in the text above,
  "sampleTitles": [first 3 event titles you found],
  "cleanTextSize": ${cleanText.length}
}`;

  const response = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    max_tokens: 2048,
    // Nudge variability up on retries so we don't just hand back the same prompt.
    temperature: attempt === 1 ? 0.2 : 0.7,
    messages: [{ role: 'user', content: analysisPrompt }],
  });

  const responseText = response.choices[0]?.message?.content || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Analysis response had no JSON object (attempt ${attempt})`);
  }
  try {
    return JSON.parse(jsonMatch[0]) as PageAnalysis;
  } catch (parseErr: any) {
    throw new Error(`Failed to parse analysis response (attempt ${attempt}): ${parseErr.message}`);
  }
}

async function runValidation(
  client: OpenAI,
  extractionPrompt: string,
  cleanText: string,
): Promise<{
  count: number;
  rawText: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  parseError?: string;
}> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    // Bumped from 4096: if the prior cap was the problem, 8192 gives 2x head-
    // room for ~40 events (each JSON object is ~100-150 tokens with our schema).
    max_tokens: 8192,
    messages: [
      { role: 'system', content: extractionPrompt },
      { role: 'user', content: `Extract all upcoming events from this page content:\n\n${cleanText}` },
    ],
  });
  const rawText = response.choices[0]?.message?.content || '';
  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;
  const totalTokens = response.usage?.total_tokens ?? 0;
  const finishReason = response.choices[0]?.finish_reason || 'unknown';
  const base = { rawText, promptTokens, completionTokens, totalTokens, finishReason };
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) return { ...base, count: 0, parseError: 'no-json-array-found' };
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return { ...base, count: 0, parseError: 'not-an-array' };
    return { ...base, count: arr.length };
  } catch (err: any) {
    return { ...base, count: 0, parseError: err?.message || 'json-parse-failed' };
  }
}
