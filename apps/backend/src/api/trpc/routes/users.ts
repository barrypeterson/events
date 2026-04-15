import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  register,
  login,
  refreshAccessToken,
  validatePassword,
} from '../../../services/auth.service';
import {
  getUserById,
  updateUser,
  deleteUser,
  updatePassword,
  getUserInteractions,
  addEventInteraction,
  removeEventInteraction,
} from '../../../services/user.service';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

const interactionTypeSchema = z.enum([
  'INTERESTED',
  'GOING',
  'NOT_INTERESTED',
  'SAVED',
  'SHARED',
]);

export const usersRouter = router({
  /**
   * Register a new user
   */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      try {
        // Validate password strength
        const passwordValidation = validatePassword(input.password);
        if (!passwordValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: passwordValidation.errors.join(', '),
          });
        }

        const result = await register(input);
        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to register user',
        });
      }
    }),

  /**
   * Login user
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await login(input);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: error instanceof Error ? error.message : 'Login failed',
        });
      }
    }),

  /**
   * Refresh access token
   */
  refreshToken: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const result = await refreshAccessToken(input.refreshToken);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Failed to refresh token',
        });
      }
    }),

  /**
   * Get current user profile
   */
  me: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const user = await getUserById(ctx.user.userId);
        return user;
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }
    }),

  /**
   * Get user by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const user = await getUserById(input.id);
        return user;
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }
    }),

  /**
   * Update user profile
   */
  update: protectedProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const user = await updateUser(ctx.user.userId, input);
        return user;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        });
      }
    }),

  /**
   * Delete user account
   */
  delete: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        await deleteUser(ctx.user.userId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete user',
        });
      }
    }),

  /**
   * Update password
   */
  updatePassword: protectedProcedure
    .input(updatePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Validate new password strength
        const passwordValidation = validatePassword(input.newPassword);
        if (!passwordValidation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: passwordValidation.errors.join(', '),
          });
        }

        await updatePassword(
          ctx.user.userId,
          input.currentPassword,
          input.newPassword
        );
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update password',
        });
      }
    }),

  /**
   * Get user event interactions
   */
  interactions: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const interactions = await getUserInteractions(ctx.user.userId);
        return interactions;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get interactions',
        });
      }
    }),

  /**
   * Add event interaction
   */
  addInteraction: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        interactionType: interactionTypeSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const interaction = await addEventInteraction(
          ctx.user.userId,
          input.eventId,
          input.interactionType
        );
        return interaction;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add interaction',
        });
      }
    }),

  /**
   * Remove event interaction
   */
  removeInteraction: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        interactionType: interactionTypeSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await removeEventInteraction(
          ctx.user.userId,
          input.eventId,
          input.interactionType
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove interaction',
        });
      }
    }),
});
