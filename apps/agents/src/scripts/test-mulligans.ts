#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { disconnect } from '@slo-events/database';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function testMulligansImage() {
  try {
    // Generate URL for November 2025
    const pattern = 'https://www.avilabeachresort.com/wp-content/uploads/sites/8747/{year}/{monthNum}/{month}_music_{year}.png';

    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const imageUrl = pattern
      .replace(/{year}/g, year.toString())
      .replace(/{month}/g, monthName)
      .replace(/{monthNum}/g, monthNum);

    console.log('Testing Mulligan\'s Bar & Grill Image Calendar Scraper');
    console.log('='.repeat(80));
    console.log(`Month: ${monthName} ${year}`);
    console.log(`Generated URL: ${imageUrl}`);
    console.log();

    console.log('Extracting events from image using Claude Vision...');
    console.log();

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const prompt = `Analyze this event calendar image and extract ALL upcoming events/performances.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

For EACH event/performance shown in the calendar, extract:
- title: The artist/performer name or event title
- date: The date (convert to format like "November 15, 2025" or "Nov 15, 2025")
- time: The time if shown (e.g., "7:00 PM", "8pm-11pm")
- description: Any additional details (genre, special notes, etc.)

CRITICAL RULES:
1. Extract ALL events from the image - do not skip any
2. Return ONLY valid JSON array - no markdown, no explanations
3. Only include FUTURE events (after ${new Date().toISOString().split('T')[0]})
4. If you cannot read the image or no events found, return: []

Return format:
[
  {
    "title": "Artist/Performer Name",
    "date": "November 15, 2025",
    "time": "7:00 PM",
    "description": "Live Music - Genre/details"
  }
]

Analyze the image and extract all events:`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      console.log('No text response from Claude');
      return;
    }

    // Parse JSON response
    let cleanedResponse = content.text.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('No JSON found in response');
      console.log('Response:', content.text);
      return;
    }

    const events = JSON.parse(jsonMatch[0]);

    console.log(`Extracted ${events.length} events:\n`);

    events.forEach((event: any, idx: number) => {
      console.log(`[${idx + 1}] ${event.title}`);
      console.log(`    Date: ${event.date}`);
      console.log(`    Time: ${event.time || 'N/A'}`);
      console.log(`    Description: ${event.description || 'N/A'}`);
      console.log();
    });

    console.log('='.repeat(80));
    console.log('✓ Test completed successfully');
    console.log('\nTo run the full scraper:');
    console.log('  pnpm --filter @slo-events/agents scrape:mulligans');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnect();
  }
}

testMulligansImage();
