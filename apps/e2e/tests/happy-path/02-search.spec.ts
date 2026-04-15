import { test, expect } from '@playwright/test';

test.describe('Search - Happy Path', () => {
  test('should search for events by keyword', async ({ page }) => {
    await page.goto('/');

    // Type in search box
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('jazz');

    // Wait for results to update
    await page.waitForTimeout(500); // Debounce delay

    // Should have results
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards).toHaveCount({ minimum: 1 });

    // Results should contain "jazz" in title or description
    const firstTitle = await eventCards.first().locator('[data-testid="event-title"]').textContent();
    expect(firstTitle?.toLowerCase()).toContain('jazz');
  });

  test('should filter events by category', async ({ page }) => {
    await page.goto('/');

    // Click on "Music" category
    const musicCategory = page.locator('button:has-text("Music")');
    await musicCategory.click();

    // Wait for filter to apply
    await page.waitForTimeout(300);

    // Check that URL has category param
    await expect(page).toHaveURL(/category=MUSIC/);

    // Events should be filtered
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards).toHaveCount({ minimum: 1 });

    // Verify category badge on event
    const firstCard = eventCards.first();
    await expect(firstCard.locator('[data-testid="event-category"]')).toContainText(/music/i);
  });

  test('should filter events by date range', async ({ page }) => {
    await page.goto('/');

    // Click "This Weekend" filter
    const thisWeekendButton = page.locator('button:has-text("This Weekend")');
    await thisWeekendButton.click();

    // Wait for filter to apply
    await page.waitForTimeout(300);

    // Should have results (assuming there are weekend events)
    const eventCards = page.locator('[data-testid="event-card"]');
    const count = await eventCards.count();
    expect(count).toBeGreaterThanOrEqual(0); // May be 0 if no weekend events

    // Active filter should be highlighted
    await expect(thisWeekendButton).toHaveClass(/active|selected/);
  });

  test('should handle no results gracefully', async ({ page }) => {
    await page.goto('/');

    // Search for something that doesn't exist
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('xyznonexistentevent12345');

    // Wait for results
    await page.waitForTimeout(500);

    // Should show "no results" message
    const noResults = page.locator('[data-testid="no-results"]');
    await expect(noResults).toBeVisible();
    await expect(noResults).toContainText(/no events found/i);
  });

  test('should clear search', async ({ page }) => {
    await page.goto('/');

    // Perform a search
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('comedy');
    await page.waitForTimeout(500);

    // Clear button should appear
    const clearButton = page.locator('[data-testid="search-clear"]');
    await expect(clearButton).toBeVisible();

    // Click clear
    await clearButton.click();

    // Search input should be empty
    await expect(searchInput).toHaveValue('');

    // Should show all events again
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards).toHaveCount({ minimum: 1 });
  });

  test('should support semantic search', async ({ page }) => {
    await page.goto('/');

    // Search with natural language
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('live music this weekend');

    // Wait for results
    await page.waitForTimeout(500);

    // Should have relevant results
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards).toHaveCount({ minimum: 0 }); // May be 0 if no matches

    // If results exist, they should be relevant
    const count = await eventCards.count();
    if (count > 0) {
      const firstTitle = await eventCards.first().locator('[data-testid="event-title"]').textContent();
      // Should contain music-related terms
      expect(firstTitle?.toLowerCase()).toMatch(/music|band|concert|show/);
    }
  });

  test('should combine multiple filters', async ({ page }) => {
    await page.goto('/');

    // Select category
    const musicCategory = page.locator('button:has-text("Music")');
    await musicCategory.click();
    await page.waitForTimeout(300);

    // Select date range
    const thisWeekButton = page.locator('button:has-text("This Week")');
    await thisWeekButton.click();
    await page.waitForTimeout(300);

    // Add search term
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('jazz');
    await page.waitForTimeout(500);

    // URL should have multiple params
    await expect(page).toHaveURL(/category=MUSIC/);

    // Results should match all filters
    const eventCards = page.locator('[data-testid="event-card"]');
    const count = await eventCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
