import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { asyncHandler } from '../../middleware/error';
import { createEvent } from '../../services/event.service';
import { createVenue } from '../../services/venue.service';
import { EventCategory } from '@slo-events/database';

/**
 * Seed test data
 * Creates sample venues and events for testing
 */
export const seedTestData = asyncHandler(
  async (req: Request, res: Response) => {
    logger.info('Starting test data seeding...');

    try {
      // Create test venues
      const venues = await Promise.all([
        createVenue({
          name: 'The Fremont Theater',
          address: '1035 Monterey St',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93401',
          latitude: 35.2828,
          longitude: -120.6596,
          venueType: 'theater',
          phone: '(805) 546-8600',
        }),
        createVenue({
          name: 'SLO Brew Rock',
          address: '855 Aerovista Pl',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93401',
          latitude: 35.2369,
          longitude: -120.6425,
          venueType: 'venue',
          phone: '(805) 543-1843',
        }),
        createVenue({
          name: 'Performing Arts Center',
          address: '1 Grand Ave',
          city: 'San Luis Obispo',
          state: 'CA',
          zipCode: '93407',
          latitude: 35.3051,
          longitude: -120.6597,
          venueType: 'theater',
          website: 'https://pacslo.org',
        }),
      ]);

      logger.info('Test venues created', { count: venues.length });

      // Create test events
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const events = await Promise.all([
        createEvent({
          title: 'Live Music Night with Local Bands',
          description:
            'Join us for an evening of live music featuring the best local bands in SLO. Great atmosphere, food, and drinks available.',
          startDateTime: tomorrow,
          venueId: venues[1]?.id || '',
          category: [EventCategory.MUSIC],
          tags: ['live music', 'local bands', 'nightlife'],
          isFree: false,
          priceMin: 15,
          priceMax: 25,
          ageRestriction: '21+',
        }),
        createEvent({
          title: 'Comedy Show: Stand-Up Spectacular',
          description:
            'Laugh until you cry with our lineup of hilarious comedians. Featuring headliner and special guests.',
          startDateTime: nextWeek,
          venueId: venues[0]?.id || '',
          category: [EventCategory.COMEDY],
          tags: ['comedy', 'stand-up', 'entertainment'],
          isFree: false,
          priceMin: 20,
          priceMax: 40,
          ticketUrl: 'https://example.com/tickets',
        }),
        createEvent({
          title: 'Classical Symphony Performance',
          description:
            'Experience the beauty of classical music performed by the San Luis Obispo Symphony Orchestra.',
          startDateTime: nextWeek,
          venueId: venues[2]?.id || '',
          category: [EventCategory.MUSIC, EventCategory.ARTS],
          tags: ['classical', 'symphony', 'orchestra'],
          isFree: false,
          priceMin: 30,
          priceMax: 75,
        }),
        createEvent({
          title: 'Free Community Yoga in the Park',
          description:
            'Start your weekend right with free community yoga. All levels welcome, bring your own mat.',
          startDateTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          venueId: venues[2]?.id || '',
          category: [EventCategory.FITNESS, EventCategory.OUTDOOR],
          tags: ['yoga', 'fitness', 'wellness', 'free'],
          isFree: true,
        }),
        createEvent({
          title: 'Farmers Market & Artisan Fair',
          description:
            'Browse local produce, crafts, and artisan goods at our weekly farmers market. Live music and food trucks!',
          startDateTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
          venueId: venues[1]?.id || '',
          category: [EventCategory.COMMUNITY, EventCategory.FOOD_WINE],
          tags: ['farmers market', 'local', 'crafts', 'food'],
          isFree: true,
        }),
      ]);

      logger.info('Test events created', { count: events.length });

      res.json({
        success: true,
        message: 'Test data seeded successfully',
        data: {
          venues: venues.length,
          events: events.length,
        },
      });
    } catch (error) {
      logger.error('Error seeding test data:', error);
      throw error;
    }
  }
);

/**
 * Cleanup test data
 * Removes all test events and venues
 */
export const cleanupTestData = asyncHandler(
  async (req: Request, res: Response) => {
    logger.info('Starting test data cleanup...');

    try {
      // Delete all events
      const deletedEvents = await prisma.event.deleteMany({});

      // Delete all venues
      const deletedVenues = await prisma.venue.deleteMany({});

      // Delete all users (except system users if any)
      const deletedUsers = await prisma.user.deleteMany({});

      logger.info('Test data cleanup completed', {
        events: deletedEvents.count,
        venues: deletedVenues.count,
        users: deletedUsers.count,
      });

      res.json({
        success: true,
        message: 'Test data cleaned up successfully',
        data: {
          events: deletedEvents.count,
          venues: deletedVenues.count,
          users: deletedUsers.count,
        },
      });
    } catch (error) {
      logger.error('Error cleaning up test data:', error);
      throw error;
    }
  }
);

/**
 * Get database statistics
 */
export const getDatabaseStats = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const [
        eventCount,
        venueCount,
        userCount,
        activeEventCount,
        upcomingEventCount,
      ] = await Promise.all([
        prisma.event.count(),
        prisma.venue.count(),
        prisma.user.count(),
        prisma.event.count({ where: { status: 'ACTIVE' } }),
        prisma.event.count({
          where: {
            status: 'ACTIVE',
            startDateTime: { gte: new Date() },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          events: {
            total: eventCount,
            active: activeEventCount,
            upcoming: upcomingEventCount,
          },
          venues: venueCount,
          users: userCount,
        },
      });
    } catch (error) {
      logger.error('Error getting database stats:', error);
      throw error;
    }
  }
);
