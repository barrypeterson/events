import { test, expect } from '@playwright/test';

test.describe('Homepage - Happy Path', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/SLO Events/i);

    // Check hero section is visible
    const hero = page.locator('h1').first();
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/happening in SLO/i);
  });

  test('should display upcoming events', async ({ page }) => {
    await page.goto('/');

    // Wait for events to load
    await page.waitForSelector('[data-testid="event-card"]', { timeout: 10000 });

    // Check that at least one event is displayed
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards).toHaveCount({ minimum: 1 });

    // Verify event card has essential information
    const firstEvent = eventCards.first();
    await expect(firstEvent.locator('[data-testid="event-title"]')).toBeVisible();
    await expect(firstEvent.locator('[data-testid="event-date"]')).toBeVisible();
    await expect(firstEvent.locator('[data-testid="event-venue"]')).toBeVisible();
  });

  test('should have working search bar', async ({ page }) => {
    await page.goto('/');

    // Find search input
    const searchInput = page.locator('[data-testid="search-input"]');
    await expect(searchInput).toBeVisible();

    // Search should be enabled
    await expect(searchInput).toBeEnabled();

    // Placeholder text should be helpful
    await expect(searchInput).toHaveAttribute('placeholder', /search/i);
  });

  test('should display category filters', async ({ page }) => {
    await page.goto('/');

    // Check for common categories
    const categories = ['Music', 'Comedy', 'Theater', 'Food & Wine'];

    for (const category of categories) {
      const categoryButton = page.locator(`button:has-text("${category}")`);
      await expect(categoryButton).toBeVisible();
    }
  });

  test('should display quick date filters', async ({ page }) => {
    await page.goto('/');

    // Check for date filter buttons
    const tonight = page.locator('button:has-text("Tonight")');
    const thisWeekend = page.locator('button:has-text("This Weekend")');
    const thisWeek = page.locator('button:has-text("This Week")');

    await expect(tonight).toBeVisible();
    await expect(thisWeekend).toBeVisible();
    await expect(thisWeek).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
    }

    await page.goto('/');

    // Mobile menu should be present
    const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
    await expect(mobileMenu).toBeVisible();

    // Events should stack vertically
    const eventCards = page.locator('[data-testid="event-card"]');
    const firstCard = eventCards.first();
    const secondCard = eventCards.nth(1);

    const firstBox = await firstCard.boundingBox();
    const secondBox = await secondCard.boundingBox();

    // Second card should be below first (not side by side)
    expect(secondBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height - 10);
  });
});
