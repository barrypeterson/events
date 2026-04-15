import { z } from 'zod';
import { router, publicProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  createVenue,
  getVenueById,
  listVenues,
  updateVenue,
  deleteVenue,
  searchVenues,
  findOrCreateVenue,
} from '../../../services/venue.service';
import {
  findPotentialDuplicates,
  mergeVenues,
  getVenuesWithDuplicates,
} from '../../../services/venue-deduplication.service';

// Validation schemas
const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  website: z.string().url().optional(),
  phone: z.string().max(20).optional(),
  venueType: z.string().max(50).optional(),
  imageUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateVenueSchema = createVenueSchema.partial().extend({
  id: z.string().uuid(),
});

const listVenuesSchema = z.object({
  city: z.string().optional(),
  venueType: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export const venuesRouter = router({
  /**
   * Create a new venue
   */
  create: publicProcedure
    .input(createVenueSchema)
    .mutation(async ({ input }) => {
      try {
        const venue = await createVenue(input);
        return venue;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create venue',
        });
      }
    }),

  /**
   * Get venue by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const venue = await getVenueById(input.id);
        return venue;
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Venue not found',
        });
      }
    }),

  /**
   * List venues with filters
   */
  list: publicProcedure
    .input(listVenuesSchema)
    .query(async ({ input }) => {
      try {
        const result = await listVenues({
          city: input.city,
          venueType: input.venueType,
          limit: input.limit,
          offset: input.offset,
        });

        return {
          venues: result.venues,
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
          message: 'Failed to list venues',
        });
      }
    }),

  /**
   * Update venue
   */
  update: publicProcedure
    .input(updateVenueSchema)
    .mutation(async ({ input }) => {
      try {
        const { id, ...data } = input;
        const venue = await updateVenue(id, data);
        return venue;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update venue',
        });
      }
    }),

  /**
   * Delete venue
   */
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        await deleteVenue(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete venue',
        });
      }
    }),

  /**
   * Search venues by name
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      try {
        const venues = await searchVenues(input.query, input.limit);
        return venues;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search venues',
        });
      }
    }),

  /**
   * Find or create venue (useful for scrapers)
   */
  findOrCreate: publicProcedure
    .input(createVenueSchema)
    .mutation(async ({ input }) => {
      try {
        const venue = await findOrCreateVenue(input);
        return venue;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to find or create venue',
        });
      }
    }),

  /**
   * Find potential duplicate venues
   */
  findDuplicates: publicProcedure.query(async () => {
    try {
      const duplicates = await findPotentialDuplicates();
      return duplicates;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to find potential duplicates',
      });
    }
  }),

  /**
   * Merge duplicate venues
   */
  merge: publicProcedure
    .input(
      z.object({
        canonicalId: z.string().uuid(),
        duplicateIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await mergeVenues(input.canonicalId, input.duplicateIds);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to merge venues',
        });
      }
    }),

  /**
   * Get venues with duplicate information
   */
  listWithDuplicates: publicProcedure.query(async () => {
    try {
      const venues = await getVenuesWithDuplicates();
      return venues;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get venues with duplicates',
      });
    }
  }),
});
