import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * - Ensures database is ready
 * - Seeds test data
 * - Performs any necessary cleanup
 */
async function globalSetup(config: FullConfig) {
  console.log('🔧 Running global setup...');

  // Wait for services to be ready
  await waitForServices();

  // Seed test data if needed
  await seedTestData();

  console.log('✅ Global setup complete');
}

async function waitForServices() {
  const maxAttempts = 30;
  const delay = 1000;

  // Wait for frontend
  console.log('⏳ Waiting for frontend (http://localhost:5173)...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:5173');
      if (response.ok || response.status === 404) {
        console.log('✅ Frontend is ready');
        break;
      }
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw new Error('Frontend failed to start');
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Wait for backend
  console.log('⏳ Waiting for backend (http://localhost:3001)...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        console.log('✅ Backend is ready');
        break;
      }
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw new Error('Backend failed to start');
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function seedTestData() {
  console.log('🌱 Seeding test data...');

  try {
    // Call seed endpoint or run seed script
    const response = await fetch('http://localhost:3001/api/test/seed', {
      method: 'POST',
    });

    if (response.ok) {
      console.log('✅ Test data seeded');
    } else {
      console.log('⚠️  Seed endpoint not available, skipping');
    }
  } catch (error) {
    console.log('⚠️  Could not seed test data, continuing anyway');
  }
}

export default globalSetup;
