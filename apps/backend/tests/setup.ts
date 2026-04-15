import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '@slo-events/database';

/**
 * Global test setup for backend unit tests
 */

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';

  // Connect to test database
  await prisma.$connect();
});

afterEach(async () => {
  // Clean up test data after each test
  // Note: Only clean up test-specific tables, not seed data
  const tablenames = [
    'user_event_interactions',
    'user_blocked_events',
    'user_blocked_recurring',
    'user_spotify_artists',
  ];

  for (const tablename of tablenames) {
    try {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tablename} CASCADE;`
      );
    } catch (error) {
      console.log(`Could not truncate ${tablename}, skipping`);
    }
  }
});

afterAll(async () => {
  // Disconnect from database
  await prisma.$disconnect();
});
