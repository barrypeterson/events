import { PrismaClient, EventCategory, EventStatus } from '@prisma/client';

/**
 * Factory function to create Prisma client extended with custom query methods
 * This avoids circular dependency issues
 */
export function createExtendedPrismaClient(prismaClient: PrismaClient) {
  return prismaClient.$extends({
    name: 'eventQueries',
    model: {
      event: {
        /**
         * Find active events with venue information
         */
        async findActive(filters?: {
          startAfter?: Date;
          startBefore?: Date;
          categories?: EventCategory[];
          venueId?: string;
          limit?: number;
        }) {
          return prismaClient.event.findMany({
            where: {
              status: EventStatus.ACTIVE,
              startDateTime: {
                ...(filters?.startAfter && { gte: filters.startAfter }),
                ...(filters?.startBefore && { lte: filters.startBefore }),
              },
              ...(filters?.categories?.length && {
                category: { hasSome: filters.categories },
              }),
              ...(filters?.venueId && { venueId: filters.venueId }),
            },
            include: {
              venue: true,
              sources: true,
            },
            orderBy: { startDateTime: 'asc' },
            take: filters?.limit,
          });
        },

        /**
         * Find events by date range with pagination
         */
        async findByDateRange(
          startDate: Date,
          endDate: Date,
          options?: {
            skip?: number;
            take?: number;
            includeVenue?: boolean;
          }
        ) {
          return prismaClient.event.findMany({
            where: {
              status: EventStatus.ACTIVE,
              startDateTime: {
                gte: startDate,
                lte: endDate,
              },
            },
            include: {
              venue: options?.includeVenue ?? true,
            },
            orderBy: { startDateTime: 'asc' },
            skip: options?.skip ?? 0,
            take: options?.take ?? 50,
          });
        },

        /**
         * Find upcoming events for a venue
         */
        async findUpcomingByVenue(venueId: string, limit = 10) {
          return prismaClient.event.findMany({
            where: {
              venueId,
              status: EventStatus.ACTIVE,
              startDateTime: { gte: new Date() },
            },
            orderBy: { startDateTime: 'asc' },
            take: limit,
          });
        },
      },

      venue: {
        /**
         * Find venues with upcoming events
         */
        async findWithUpcomingEvents(options?: {
          city?: string;
          venueType?: string;
          limit?: number;
        }) {
          return prismaClient.venue.findMany({
            where: {
              ...(options?.city && { city: options.city }),
              ...(options?.venueType && { venueType: options.venueType }),
              events: {
                some: {
                  status: EventStatus.ACTIVE,
                  startDateTime: { gte: new Date() },
                },
              },
            },
            include: {
              events: {
                where: {
                  status: EventStatus.ACTIVE,
                  startDateTime: { gte: new Date() },
                },
                orderBy: { startDateTime: 'asc' },
                take: 5,
              },
            },
            take: options?.limit,
          });
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;
