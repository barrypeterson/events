import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { verifyAccessToken } from '../../lib/jwt';

export interface Context {
  user?: {
    userId: string;
    email: string;
  };
  req: CreateExpressContextOptions['req'];
  res: CreateExpressContextOptions['res'];
}

/**
 * Create tRPC context from Express request/response
 */
export async function createContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<Context> {
  // Try to get user from Authorization header
  const authHeader = req.headers.authorization;
  let user: Context['user'] = undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (payload) {
      user = {
        userId: payload.userId,
        email: payload.email,
      };
    }
  }

  return {
    user,
    req,
    res,
  };
}

export type CreateContextFn = typeof createContext;
