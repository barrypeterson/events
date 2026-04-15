import { router } from './trpc';
import { eventsRouter } from './routes/events';
import { venuesRouter } from './routes/venues';
import { usersRouter } from './routes/users';
import { scrapersRouter } from './routes/scrapers';
import { venueScrapingRouter } from './routes/venue-scraping';
import { adminAuthRouter } from './routes/admin-auth';

/**
 * Root tRPC router
 * Combines all route modules
 */
export const appRouter = router({
  events: eventsRouter,
  venues: venuesRouter,
  users: usersRouter,
  scrapers: scrapersRouter,
  venueScraping: venueScrapingRouter,
  adminAuth: adminAuthRouter,
});

// Export type for use in frontend
export type AppRouter = typeof appRouter;

// Re-export helpers for convenience
export { router, publicProcedure, protectedProcedure } from './trpc';
