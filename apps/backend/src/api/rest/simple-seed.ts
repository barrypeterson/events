// @ts-nocheck — dev-only seed file, schema has drifted
import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { asyncHandler } from '../../middleware/error';

/**
 * Simple seed without embeddings
 * Creates sample venues and events without requiring OpenAI
 */
export const simpleSeed = asyncHandler(async (req: Request, res: Response) => {
  logger.info('Starting simple test data seeding...');

  try {
    // Create venues directly in database
    const venues = await Promise.all([
      prisma.venue.create({
        data: {
          name: 'The Fremont Theater',
          normalizedName: 'fremont theater',
          address: '1035 Monterey St',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93401',
          country: 'USA',
          latitude: 35.2828,
          longitude: -120.6596,
          venueType: 'theater',
          phone: '(805) 546-8600',
        },
      }),
      prisma.venue.create({
        data: {
          name: 'SLO Brew Rock',
          normalizedName: 'slo brew rock',
          address: '855 Aerovista Pl',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93401',
          country: 'USA',
          latitude: 35.2369,
          longitude: -120.6425,
          venueType: 'venue',
          phone: '(805) 543-1843',
        },
      }),
      prisma.venue.create({
        data: {
          name: 'Performing Arts Center SLO',
          normalizedName: 'performing arts center slo',
          address: '1 Grand Ave',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93407',
          country: 'USA',
          latitude: 35.3051,
          longitude: -120.6597,
          venueType: 'theater',
          phone: '(805) 756-4849',
        },
      }),
    ]);

    logger.info(`Created ${venues.length} venues`);

    // Create events directly
    const now = new Date();
    const events = await Promise.all([
      prisma.event.create({
        data: {
          title: 'Live Jazz Night',
          normalizedTitle: 'live jazz night',
          description: 'An evening of smooth jazz featuring local and touring musicians.',
          startDateTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
          endDateTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // +3 hours
          venueId: venues[0].id,
          category: ['MUSIC'],
          tags: ['jazz', 'live music', 'evening'],
          priceMin: 15,
          priceMax: 30,
          ticketUrl: 'https://example.com/tickets/jazz',
          status: 'PUBLISHED',
          confidenceScore: 0.95,
        },
      }),
      prisma.event.create({
        data: {
          title: 'Comedy Show - Stand Up Special',
          normalizedTitle: 'comedy show stand up special',
          description: 'Top comedians perform their best routines in an intimate setting.',
          startDateTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days
          endDateTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
          venueId: venues[1].id,
          category: ['COMEDY'],
          tags: ['comedy', 'stand-up', 'entertainment'],
          priceMin: 20,
          priceMax: 35,
          ticketUrl: 'https://example.com/tickets/comedy',
          status: 'PUBLISHED',
          confidenceScore: 0.9,
        },
      }),
      prisma.event.create({
        data: {
          title: 'Classical Orchestra Performance',
          normalizedTitle: 'classical orchestra performance',
          description: 'The SLO Symphony Orchestra performs classical masterpieces.',
          startDateTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
          endDateTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000),
          venueId: venues[2].id,
          category: ['MUSIC', 'ARTS'],
          tags: ['classical', 'orchestra', 'symphony'],
          priceMin: 25,
          priceMax: 50,
          ticketUrl: 'https://example.com/tickets/orchestra',
          status: 'PUBLISHED',
          confidenceScore: 0.98,
        },
      }),
      prisma.event.create({
        data: {
          title: 'Rock Concert - Local Bands',
          normalizedTitle: 'rock concert local bands',
          description: 'Three local rock bands showcase their latest music.',
          startDateTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
          endDateTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
          venueId: venues[1].id,
          category: ['MUSIC'],
          tags: ['rock', 'live music', 'local bands'],
          priceMin: 10,
          priceMax: 20,
          ticketUrl: 'https://example.com/tickets/rock',
          status: 'PUBLISHED',
          confidenceScore: 0.92,
        },
      }),
      prisma.event.create({
        data: {
          title: 'Theater: A Midsummer Night\'s Dream',
          normalizedTitle: 'theater a midsummer nights dream',
          description: 'Shakespeare\'s beloved comedy comes to life on stage.',
          startDateTime: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days
          endDateTime: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
          venueId: venues[0].id,
          category: ['THEATER', 'ARTS'],
          tags: ['shakespeare', 'theater', 'drama'],
          priceMin: 18,
          priceMax: 40,
          ticketUrl: 'https://example.com/tickets/theater',
          status: 'PUBLISHED',
          confidenceScore: 0.96,
        },
      }),
      prisma.event.create({
        data: {
          title: 'Food & Wine Festival',
          normalizedTitle: 'food wine festival',
          description: 'Sample the best local wines and gourmet food from SLO County.',
          startDateTime: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), // 21 days
          endDateTime: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000),
          venueId: venues[2].id,
          category: ['FOOD_WINE', 'COMMUNITY'],
          tags: ['food', 'wine', 'festival', 'tasting'],
          priceMin: 45,
          priceMax: 85,
          ticketUrl: 'https://example.com/tickets/food-wine',
          status: 'PUBLISHED',
          confidenceScore: 0.94,
        },
      }),
    ]);

    logger.info(`Created ${events.length} events`);

    res.status(200).json({
      success: true,
      message: 'Test data seeded successfully',
      data: {
        venuesCreated: venues.length,
        eventsCreated: events.length,
      },
    });
  } catch (error) {
    logger.error('Error seeding test data:', error);
    throw new Error('Failed to seed test data');
  }
});
