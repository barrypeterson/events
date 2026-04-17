import OpenAI from 'openai';
import { prisma } from '@slo-events/database';
import { navigateAndExtract } from '../lib/page-utils';
import { logger } from '../lib/scraper-utils';
import type { PageAnalysis } from '../types';

const ANALYSIS_MODEL = 'gpt-4o';

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Analyze a venue's events page to learn its structure.
 * One-time expensive operation that generates an optimized extraction prompt.
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

  // 2. Ask gpt-4o to analyze the content and write an extraction prompt
  const analysisPrompt = `You are analyzing an events page for a venue called "${config.venue.name}" at ${config.sourceUrl}.

Your job: understand how events are presented on this page, then write a compact extraction prompt that a cheaper AI model (gpt-4o-mini) can use to efficiently extract events from this page's text content on future visits.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

Here is the clean text content of the page:
---
${cleanText}
---

Respond with a JSON object (no markdown fences) with these fields:

{
  "version": 1,
  "pageDescription": "Brief description of how events appear on this page",
  "extractionPrompt": "A focused system prompt for gpt-4o-mini that tells it exactly how to extract events from this page's text. CRITICAL: The prompt MUST instruct the model to return a JSON array where each event has these fields: title, rawDate, rawTime, rawDescription, rawPrice, imageUrl (from [IMAGE: url] markers, null if none), url (from [LINK: url] markers, this should be the event detail page or ticket purchase link — NOT navigation links, ads, social media, or spam links. Only pick a link that clearly relates to the specific event. null if no relevant link found). The prompt MUST say 'Return ONLY a JSON array, no markdown, no explanations.' The prompt should explain that [IMAGE: url] markers indicate the event's poster image, and [LINK: url] markers indicate clickable links on the page — the model must use judgment to pick the correct event/ticket link and ignore irrelevant ones. Include: what patterns to look for (date formats, event titles, price formats), what the venue name is, any quirks. 200-400 words max.",
  "pageType": "static" | "js-rendered" | "spa" | "infinite-scroll",
  "waitStrategy": "networkidle" | "selector" | "timeout",
  "waitValue": null or a CSS selector string or timeout in ms,
  "requiresScrolling": false,
  "sampleEventCount": number of events you can see in the text above,
  "sampleTitles": [first 3 event titles you found],
  "cleanTextSize": ${cleanText.length}
}`;

  const client = getOpenAI();
  const analysisResponse = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: analysisPrompt }],
  });

  const responseText = analysisResponse.choices[0]?.message?.content || '';
  let analysis: PageAnalysis;

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    analysis = JSON.parse(jsonMatch[0]);
  } catch (parseErr: any) {
    throw new Error(`Failed to parse analysis response: ${parseErr.message}`);
  }

  logger.info(`[analyze] ${config.sourceName}: found ${analysis.sampleEventCount} sample events, page type: ${analysis.pageType}`);

  // 3. Validate by running the extraction prompt against the same text
  const validationResponse = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: analysis.extractionPrompt },
      { role: 'user', content: `Extract all upcoming events from this page content:\n\n${cleanText}` },
    ],
  });

  const validationText = validationResponse.choices[0]?.message?.content || '[]';
  let validatedEvents: any[] = [];
  try {
    const match = validationText.match(/\[[\s\S]*\]/);
    validatedEvents = match ? JSON.parse(match[0]) : [];
  } catch {
    logger.warn(`[analyze] Validation parse failed, proceeding with analysis anyway`);
  }

  logger.info(`[analyze] Validation: extraction prompt found ${validatedEvents.length} events (analysis saw ${analysis.sampleEventCount})`);

  // 3a. Guard: refuse to store a prompt that can't extract events.
  // Past bug: if sampleEventCount was 37 but the generated prompt produced 0
  // on the same text, we stored it anyway and every refresh afterwards
  // returned raw=0. Require validation to recover at least 50% of samples,
  // or at least 1 event when only a handful were detected.
  const minExpected = Math.max(1, Math.floor(analysis.sampleEventCount * 0.5));
  if (analysis.sampleEventCount > 0 && validatedEvents.length < minExpected) {
    logger.error(
      `[analyze] ${config.sourceName}: REJECTING prompt — validation extracted ${validatedEvents.length} events but analysis detected ${analysis.sampleEventCount} (need >=${minExpected}). Prompt preview: "${analysis.extractionPrompt.slice(0, 300)}"`,
    );
    throw new Error(
      `Generated extraction prompt failed validation: detected ${analysis.sampleEventCount} events but the prompt only extracted ${validatedEvents.length}. Re-run analyze (the LLM will try again).`,
    );
  }

  // 4. Store the analysis
  await prisma.venueScraperConfig.update({
    where: { id: configId },
    data: {
      pageAnalysis: analysis as any,
      analysisModel: ANALYSIS_MODEL,
      analyzedAt: new Date(),
    },
  });

  logger.info(
    `[analyze] ${config.sourceName}: analysis complete and stored (validation=${validatedEvents.length}/${analysis.sampleEventCount})`,
  );
  return analysis;
}
