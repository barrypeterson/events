import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

// Simple token store (in-memory, survives for the lifetime of the server)
const validTokens = new Set<string>();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function isValidAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  return validTokens.has(token);
}

export const adminAuthRouter = router({
  /**
   * Login with admin password, returns a session token
   */
  login: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ input }) => {
      const { env } = await import('../../../config/env');

      if (input.password !== env.ADMIN_PASSWORD) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }

      const token = generateToken();
      validTokens.add(token);

      return { token };
    }),

  /**
   * Check if a token is valid
   */
  verify: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(({ input }) => {
      return { valid: isValidAdminToken(input.token) };
    }),

  /**
   * Logout — invalidate token
   */
  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => {
      validTokens.delete(input.token);
      return { success: true };
    }),
});
