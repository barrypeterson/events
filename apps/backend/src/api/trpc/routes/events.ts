import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  createEvent,
  getEventById,
  listEvents,
  updateEvent,
  deleteEvent,
  getUpcomingEvents,
  getEventsByCategory,
  getEventsByVenue,
  getEventsByDateRange,
} from '../../../services/event.service';
import {
  searchEventsBySimilarity,
  findSimilarEvents,
  hybridSearch,
} from '../../../services/search.service';
import {
  findPotentialDuplicates,
  mergeDuplicateEvent,
  getDuplicateRelationships,
  batchDeduplicateEvents,
} from '../../../services/deduplication.service';
import {
  markEventRecurring,
  getRecurringPatterns,
} from '../../../services/recurring.service';
import { EventCategory, EventStatus } from '@slo-events/database';

// Validation schemas
const eventCategorySchema = z.enum([
  'MUSIC',
  'COMEDY',
  'THEATER',
  'SPORTS',
  'FOOD_WINE',
  'ARTS',
  'COMMUNITY',
  'FAMILY',
  'KIDS',
  'OUTDOOR',
  'FITNESS',
  'EDUCATION',
  'BUSINESS',
  'OTHER',
]);

const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startDateTime: z.date(),
  endDateTime: z.date().optional(),
  timezone: z.string().default('America/Los_Angeles'),
  venueId: z.string().uuid(),
  category: z.array(eventCategorySchema).optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string().url()).optional(),
  ticketUrl: z.string().url().optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  isFree: z.boolean().optional(),
  ageRestriction: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateEventSchema = createEventSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(['ACTIVE', 'CANCELLED', 'POSTPONED', 'MERGED', 'DELETED']).optional(),
});

const searchEventsSchema = z.object({
  query: z.string().optional(),
  category: z.array(eventCategorySchema).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  venueId: z.string().uuid().optional(),
  isFree: z.boolean().optional(),
  showPastEvents: z.boolean().optional().default(false),
  showRecurringEvents: z.boolean().optional().default(false),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const eventsRouter = router({
  /**
   * Create a new event
   */
  create: protectedProcedure
    .input(createEventSchema)
    .mutation(async ({ input }) => {
      try {
        const event = await createEvent({
          ...input,
          category: input.category as EventCategory[] | undefined,
        });
        return event;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create event',
        });
      }
    }),

  /**
   * Get event by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const event = await getEventById(input.id);
        return event;
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Event not found',
        });
      }
    }),

  /**
   * List events with filters
   */
  list: publicProcedure
    .input(searchEventsSchema.optional().default({}))
    .query(async ({ input }) => {
      try {
        const result = await listEvents({
          query: input.query,
          category: input.category as EventCategory[] | undefined,
          startDate: input.startDate,
          endDate: input.endDate,
          venueId: input.venueId,
          isFree: input.isFree,
          showPastEvents: input.showPastEvents,
          showRecurringEvents: input.showRecurringEvents,
          limit: input.limit,
          offset: input.offset,
        });

        return {
          events: result.events,
          pagination: {
            limit: result.limit,
            offset: result.offset,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list events',
        });
      }
    }),

  /**
   * Update event
   */
  update: protectedProcedure
    .input(updateEventSchema)
    .mutation(async ({ input }) => {
      try {
        const { id, ...data } = input;
        const event = await updateEvent(id, {
          ...data,
          category: data.category as EventCategory[] | undefined,
          status: data.status as EventStatus | undefined,
        });
        return event;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update event',
        });
      }
    }),

  /**
   * Delete event
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        await deleteEvent(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete event',
        });
      }
    }),

  /**
   * Get upcoming events
   */
  upcoming: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      try {
        const events = await getUpcomingEvents(input.limit);
        return events;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get upcoming events',
        });
      }
    }),

  /**
   * Get events by category
   */
  byCategory: publicProcedure
    .input(
      z.object({
        category: eventCategorySchema,
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        const events = await getEventsByCategory(input.category, input.limit);
        return events;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get events by category',
        });
      }
    }),

  /**
   * Get events by venue
   */
  byVenue: publicProcedure
    .input(
      z.object({
        venueId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      try {
        const events = await getEventsByVenue(input.venueId, input.limit);
        return events;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get events by venue',
        });
      }
    }),

  /**
   * Get events by date range
   */
  byDateRange: publicProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        limit: z.number().min(1).max(100).default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const events = await getEventsByDateRange(
          input.startDate,
          input.endDate,
          input.limit
        );
        return events;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get events by date range',
        });
      }
    }),

  /**
   * Search events using vector similarity
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
        threshold: z.number().min(0).max(1).default(0.7),
        category: z.array(eventCategorySchema).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const results = await searchEventsBySimilarity(input.query, {
          limit: input.limit,
          threshold: input.threshold,
          category: input.category,
          startDate: input.startDate,
          endDate: input.endDate,
        });
        return results;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search events',
        });
      }
    }),

  /**
   * Hybrid search (vector + text)
   */
  hybridSearch: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
        category: z.array(eventCategorySchema).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const results = await hybridSearch(input.query, {
          limit: input.limit,
          category: input.category,
          startDate: input.startDate,
          endDate: input.endDate,
        });
        return results;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to perform hybrid search',
        });
      }
    }),

  /**
   * Find similar events
   */
  similar: publicProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(10),
        threshold: z.number().min(0).max(1).default(0.8),
      })
    )
    .query(async ({ input }) => {
      try {
        const results = await findSimilarEvents(input.eventId, {
          limit: input.limit,
          threshold: input.threshold,
        });
        return results;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to find similar events',
        });
      }
    }),

  /**
   * Find potential duplicate events
   */
  findDuplicates: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        threshold: z.number().min(0).max(1).default(0.85),
      })
    )
    .query(async ({ input }) => {
      try {
        const duplicates = await findPotentialDuplicates(
          input.eventId,
          input.threshold
        );
        return duplicates;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to find duplicates',
        });
      }
    }),

  /**
   * Merge duplicate event
   */
  mergeDuplicate: protectedProcedure
    .input(
      z.object({
        canonicalEventId: z.string().uuid(),
        duplicateEventId: z.string().uuid(),
        similarityScore: z.number().min(0).max(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await mergeDuplicateEvent(
          input.canonicalEventId,
          input.duplicateEventId,
          input.similarityScore
        );
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to merge duplicate event',
        });
      }
    }),

  /**
   * Get duplicate relationships
   */
  duplicateRelationships: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const relationships = await getDuplicateRelationships(input.eventId);
        return relationships;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get duplicate relationships',
        });
      }
    }),

  /**
   * Batch deduplicate events
   */
  batchDeduplicate: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
        autoMerge: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await batchDeduplicateEvents({
          limit: input.limit,
          autoMerge: input.autoMerge,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to batch deduplicate events',
        });
      }
    }),

  /**
   * Mark event as recurring (with learning)
   */
  markRecurring: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        isRecurring: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const event = await markEventRecurring(input.eventId, input.isRecurring);
        return event;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark event recurring',
        });
      }
    }),

  /**
   * Tonight Mode: events bucketed by time (Happening Now / Coming Up / Later Tonight)
   */
  tonight: publicProcedure.query(async () => {
    const { prisma } = await import('@slo-events/database');
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // End of day: 11:59 PM today in local time, or 4 AM tomorrow if past midnight
    const endOfDay = new Date(now);
    if (now.getHours() < 4) {
      // After midnight, show events through 4 AM
      endOfDay.setHours(4, 0, 0, 0);
    } else {
      endOfDay.setHours(23, 59, 59, 999);
    }

    // "Happening now" means started TODAY, not months ago.
    // Programs with far-future endDateTime (e.g., semester-long classes)
    // are not "happening now" events.
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const include = {
      venue: { select: { id: true, name: true, address: true, city: true } },
    };
    const baseWhere = { status: 'ACTIVE' as const };

    // Bucket 1: Happening Now (started today and not yet ended)
    const happeningNow = await prisma.event.findMany({
      where: {
        ...baseWhere,
        startDateTime: { gte: startOfToday, lte: now },
        OR: [
          { endDateTime: { gt: now } },
          { endDateTime: null, startDateTime: { gte: threeHoursAgo } },
        ],
      },
      include,
      orderBy: { startDateTime: 'asc' },
    });

    // Bucket 2: Coming Up (starts within 2 hours, not yet started)
    const comingUp = await prisma.event.findMany({
      where: {
        ...baseWhere,
        startDateTime: { gt: now, lte: twoHoursFromNow },
      },
      include,
      orderBy: { startDateTime: 'asc' },
    });

    // Bucket 3: Later Tonight (after 2 hours, before end of day)
    const laterTonight = await prisma.event.findMany({
      where: {
        ...baseWhere,
        startDateTime: { gt: twoHoursFromNow, lte: endOfDay },
      },
      include,
      orderBy: { startDateTime: 'asc' },
    });

    return {
      happeningNow,
      comingUp,
      laterTonight,
      totalCount: happeningNow.length + comingUp.length + laterTonight.length,
      asOf: now.toISOString(),
    };
  }),

  /**
   * This Weekend: events for Saturday and Sunday
   */
  weekend: publicProcedure.query(async () => {
    const { prisma } = await import('@slo-events/database');
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

    // Find next Saturday (or today if already Saturday)
    const saturday = new Date(now);
    const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
    saturday.setDate(now.getDate() + daysUntilSat);
    saturday.setHours(0, 0, 0, 0);

    // Sunday end
    const sundayEnd = new Date(saturday);
    sundayEnd.setDate(saturday.getDate() + 1);
    sundayEnd.setHours(23, 59, 59, 999);

    const include = {
      venue: { select: { id: true, name: true, address: true, city: true } },
    };

    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        startDateTime: { gte: saturday, lte: sundayEnd },
      },
      include,
      orderBy: { startDateTime: 'asc' },
    });

    return {
      events,
      totalCount: events.length,
      saturday: saturday.toISOString(),
      sundayEnd: sundayEnd.toISOString(),
    };
  }),

  /**
   * Get learned recurring patterns
   */
  getRecurringPatterns: publicProcedure.query(async () => {
    try {
      const patterns = await getRecurringPatterns();
      return patterns;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get recurring patterns',
      });
    }
  }),
});
