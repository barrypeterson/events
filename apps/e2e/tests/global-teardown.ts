import { FullConfig } from '@playwright/test';

/**
 * Global teardown for Playwright tests
 * - Cleanup test data
 * - Close connections
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Running global teardown...');

  // Cleanup test data if needed
  await cleanupTestData();

  console.log('✅ Global teardown complete');
}

async function cleanupTestData() {
  try {
    // Call cleanup endpoint
    const response = await fetch('http://localhost:3001/api/test/cleanup', {
      method: 'POST',
    });

    if (response.ok) {
      console.log('✅ Test data cleaned up');
    } else {
      console.log('⚠️  Cleanup endpoint not available, skipping');
    }
  } catch (error) {
    console.log('⚠️  Could not cleanup test data');
  }
}

export default globalTeardown;
