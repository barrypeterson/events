import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import {
  EventCreateInput,
  EventUpdateInput,
  EventSearchParams,
  EventWithVenue,
} from '../types';
import { NotFoundError } from '../middleware/error';
import { generateEmbedding, createEmbeddingText } from '../lib/openai';
import { storeImages } from './image.service';
import { Prisma } from '@slo-events/database';

/**
 * Normalize event title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Create a new event
 */
export async function createEvent(
  input: EventCreateInput
): Promise<EventWithVenue> {
  try {
    const normalizedTitle = normalizeTitle(input.title);

    // Get venue info for embedding
    const venue = await prisma.venue.findUnique({
      where: { id: input.venueId },
    });

    if (!venue) {
      throw new NotFoundError('Venue not found');
    }

    // Generate embedding
    const embeddingText = createEmbeddingText({
      title: input.title,
      description: input.description,
      category: input.category?.map((c) => c.toString()),
      tags: input.tags,
      venueName: venue.name,
    });
    const embedding = await generateEmbedding(embeddingText);

    // Store images in S3 (falls through to original URLs if not configured)
    const storedImages = await storeImages(input.images || []);

    // Create event using raw SQL to handle vector type
    const eventId = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO events (
        title, normalized_title, description, start_datetime, end_datetime,
        timezone, venue_id, category, tags, images, ticket_url,
        price_min, price_max, is_free, age_restriction, is_recurring,
        recurring_pattern, embedding, metadata
      ) VALUES (
        ${input.title}, ${normalizedTitle}, ${input.description},
        ${input.startDateTime}::timestamptz, ${input.endDateTime || null}::timestamptz,
        ${input.timezone || 'America/Los_Angeles'}, ${input.venueId}::uuid,
        ${input.category || []}::event_category[], ${input.tags || []},
        ${storedImages}, ${input.ticketUrl},
        ${input.priceMin}, ${input.priceMax}, ${input.isFree || false},
        ${input.ageRestriction}, ${input.isRecurring || false},
        ${input.recurringPattern ? JSON.stringify(input.recurringPattern) : null}::jsonb,
        ${embedding}::vector, ${JSON.stringify(input.metadata || {})}::jsonb
      )
      RETURNING id
    `;

    // Fetch the created event with venue
    const event = await prisma.event.findUnique({
      where: { id: eventId[0].id },
      include: { venue: true },
    });

    logger.info('Event created successfully', { eventId: event?.id });

    return event as EventWithVenue;
  } catch (error) {
    logger.error('Create event error:', error);
    throw new Error('Failed to create event');
  }
}

/**
 * Get event by ID
 */
export async function getEventById(eventId: string): Promise<EventWithVenue> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: true,
        sources: true,
      },
    });

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    return event as EventWithVenue;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Get event error:', error);
    throw new Error('Failed to get event');
  }
}

/**
 * List events with filters
 */
export async function listEvents(params?: EventSearchParams) {
  try {
    const {
      query,
      category,
      startDate,
      endDate,
      venueId,
      isFree,
      showPastEvents = false,
      showRecurringEvents = false,
      limit = 50,
      offset = 0,
    } = params || {};

    const where: Prisma.EventWhereInput = {
      status: 'ACTIVE',
    };

    // Add text search if query provided
    if (query && query.trim().length > 0) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          tags: {
            hasSome: [query.toLowerCase()],
          },
        },
      ];
    }

    if (category && category.length > 0) {
      where.category = {
        hasSome: category,
      };
    }

    // Date filtering - by default show only upcoming events unless showPastEvents is true
    if (startDate || endDate || !showPastEvents) {
      where.startDateTime = {};

      if (startDate) {
        where.startDateTime.gte = startDate;
      } else if (!showPastEvents) {
        // Default: show only upcoming events (from now onwards)
        where.startDateTime.gte = new Date();
      }

      if (endDate) {
        where.startDateTime.lte = endDate;
      }
    }

    if (venueId) {
      where.venueId = venueId;
    }

    if (isFree !== undefined) {
      where.isFree = isFree;
    }

    // Hide recurring events by default (e.g., weekly trivia, daily happy hours)
    // unless explicitly requested - keeps homepage focused on special one-time events
    if (!showRecurringEvents) {
      where.isRecurring = false;
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          venue: true,
        },
        take: limit,
        skip: offset,
        orderBy: {
          startDateTime: 'asc',
        },
      }),
      prisma.event.count({ where }),
    ]);

    return {
      events: events as EventWithVenue[],
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error('List events error:', error);
    throw new Error('Failed to list events');
  }
}

/**
 * Update event
 */
export async function updateEvent(
  eventId: string,
  input: EventUpdateInput
): Promise<EventWithVenue> {
  try {
    const updateData: any = { ...input };

    // Update normalized title if title changed
    if (input.title) {
      updateData.normalizedTitle = normalizeTitle(input.title);
    }

    // Regenerate embedding if relevant fields changed
    if (
      input.title ||
      input.description ||
      input.category ||
      input.tags ||
      input.venueId
    ) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      });

      if (event) {
        const venue = input.venueId
          ? await prisma.venue.findUnique({ where: { id: input.venueId } })
          : event.venue;

        const embeddingText = createEmbeddingText({
          title: input.title || event.title,
          description: input.description !== undefined ? input.description : (event.description || undefined),
          category: (input.category || event.category)?.map((c) => c.toString()),
          tags: input.tags || event.tags,
          venueName: venue?.name,
        });
        const embedding = await generateEmbedding(embeddingText);

        await prisma.$executeRaw`
          UPDATE events
          SET embedding = ${embedding}::vector
          WHERE id = ${eventId}::uuid
        `;
      }
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
      include: { venue: true },
    });

    logger.info('Event updated successfully', { eventId });

    return event as EventWithVenue;
  } catch (error) {
    logger.error('Update event error:', error);
    throw new Error('Failed to update event');
  }
}

/**
 * Delete event (soft delete by setting status to DELETED)
 */
export async function deleteEvent(eventId: string): Promise<void> {
  try {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        status: 'DELETED',
      },
    });

    logger.info('Event deleted successfully', { eventId });
  } catch (error) {
    logger.error('Delete event error:', error);
    throw new Error('Failed to delete event');
  }
}

/**
 * Get upcoming events
 */
export async function getUpcomingEvents(limit = 20) {
  try {
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        startDateTime: {
          gte: new Date(),
        },
      },
      include: {
        venue: true,
      },
      take: limit,
      orderBy: {
        startDateTime: 'asc',
      },
    });

    return events as EventWithVenue[];
  } catch (error) {
    logger.error('Get upcoming events error:', error);
    throw new Error('Failed to get upcoming events');
  }
}

/**
 * Get events by date range
 */
export async function getEventsByDateRange(
  startDate: Date,
  endDate: Date,
  limit = 100
) {
  try {
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        startDateTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        venue: true,
      },
      take: limit,
      orderBy: {
        startDateTime: 'asc',
      },
    });

    return events as EventWithVenue[];
  } catch (error) {
    logger.error('Get events by date range error:', error);
    throw new Error('Failed to get events by date range');
  }
}

/**
 * Get events by venue
 */
export async function getEventsByVenue(venueId: string, limit = 20) {
  try {
    const events = await prisma.event.findMany({
      where: {
        venueId,
        status: 'ACTIVE',
        startDateTime: {
          gte: new Date(),
        },
      },
      include: {
        venue: true,
      },
      take: limit,
      orderBy: {
        startDateTime: 'asc',
      },
    });

    return events as EventWithVenue[];
  } catch (error) {
    logger.error('Get events by venue error:', error);
    throw new Error('Failed to get events by venue');
  }
}

/**
 * Get events by category
 */
export async function getEventsByCategory(
  category: string,
  limit = 20
) {
  try {
    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        category: {
          has: category as any,
        },
        startDateTime: {
          gte: new Date(),
        },
      },
      include: {
        venue: true,
      },
      take: limit,
      orderBy: {
        startDateTime: 'asc',
      },
    });

    return events as EventWithVenue[];
  } catch (error) {
    logger.error('Get events by category error:', error);
    throw new Error('Failed to get events by category');
  }
}
