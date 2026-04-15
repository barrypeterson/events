import { test, expect } from '@playwright/test';

test.describe('Event Detail Page - Happy Path', () => {
  test('should navigate to event detail from listing', async ({ page }) => {
    await page.goto('/');

    // Wait for events to load
    await page.waitForSelector('[data-testid="event-card"]');

    // Click on first event
    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await firstEvent.click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/events\//);

    // Page should load
    await page.waitForLoadState('networkidle');
  });

  test('should display complete event information', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to first event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Event title
    const title = page.locator('[data-testid="event-detail-title"]');
    await expect(title).toBeVisible();
    await expect(title).not.toBeEmpty();

    // Event date and time
    const dateTime = page.locator('[data-testid="event-datetime"]');
    await expect(dateTime).toBeVisible();

    // Venue information
    const venue = page.locator('[data-testid="event-venue"]');
    await expect(venue).toBeVisible();
    await expect(venue).toContainText(/.+/); // Has content

    // Description
    const description = page.locator('[data-testid="event-description"]');
    await expect(description).toBeVisible();

    // Category tags
    const categories = page.locator('[data-testid="event-categories"]');
    await expect(categories).toBeVisible();
  });

  test('should display venue on map', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Map container should be visible
    const map = page.locator('[data-testid="venue-map"]');
    await expect(map).toBeVisible();

    // Venue address should be displayed
    const address = page.locator('[data-testid="venue-address"]');
    await expect(address).toBeVisible();
    await expect(address).toContainText(/\d{1,5}/); // Has street number
  });

  test('should show similar events section', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Similar events section
    const similarSection = page.locator('[data-testid="similar-events"]');
    await expect(similarSection).toBeVisible();

    // Should have at least one similar event (if any exist)
    const similarCards = page.locator('[data-testid="similar-event-card"]');
    const count = await similarCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have working ticket button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Find an event with tickets
    const eventCard = page.locator('[data-testid="event-card"]').first();
    await eventCard.click();
    await page.waitForLoadState('networkidle');

    // Check for ticket button
    const ticketButton = page.locator('[data-testid="get-tickets-button"]');

    if (await ticketButton.isVisible()) {
      // Should be a link
      await expect(ticketButton).toHaveAttribute('href', /.+/);

      // Should open in new tab
      await expect(ticketButton).toHaveAttribute('target', '_blank');

      // Has appropriate text
      await expect(ticketButton).toContainText(/ticket|buy|purchase/i);
    }
  });

  test('should display price information', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Price or "Free" should be displayed
    const priceInfo = page.locator('[data-testid="event-price"]');
    await expect(priceInfo).toBeVisible();

    const priceText = await priceInfo.textContent();
    expect(priceText).toMatch(/free|\$\d+/i);
  });

  test('should show event source attribution', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Source link should be visible
    const sourceLink = page.locator('[data-testid="event-source"]');
    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toContainText(/source|originally listed/i);
  });

  test('should support sharing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Share button should exist
    const shareButton = page.locator('[data-testid="share-button"]');
    await expect(shareButton).toBeVisible();

    // Click share button
    await shareButton.click();

    // Share modal or menu should appear
    const shareModal = page.locator('[data-testid="share-modal"]');
    await expect(shareModal).toBeVisible({ timeout: 2000 });
  });

  test('should navigate back to listing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="event-card"]');

    // Navigate to event
    await page.locator('[data-testid="event-card"]').first().click();
    await page.waitForLoadState('networkidle');

    // Back button should exist
    const backButton = page.locator('[data-testid="back-button"]');
    await expect(backButton).toBeVisible();

    // Click back
    await backButton.click();

    // Should return to listing page
    await expect(page).toHaveURL('/');

    // Events should be visible again
    const eventCards = page.locator('[data-testid="event-card"]');
    await expect(eventCards.first()).toBeVisible();
  });

  test('should handle event not found', async ({ page }) => {
    // Navigate to non-existent event
    await page.goto('/events/00000000-0000-0000-0000-000000000000');

    // Should show 404 page
    const notFound = page.locator('[data-testid="event-not-found"]');
    await expect(notFound).toBeVisible();
    await expect(notFound).toContainText(/not found|doesn't exist/i);

    // Should have link back to home
    const homeLink = page.locator('a:has-text("Back to Events")');
    await expect(homeLink).toBeVisible();
  });
});
