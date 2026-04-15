import { test, expect } from '@playwright/test';

/**
 * API Tests - Test backend endpoints directly
 */

test.describe('Events API - Happy Path', () => {
  const API_BASE = 'http://localhost:3001';

  test('should return health check', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('should list events', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/trpc/events.list`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('data');

    const events = body.result.data;
    expect(Array.isArray(events)).toBeTruthy();
  });

  test('should get single event', async ({ request }) => {
    // First, get list of events
    const listResponse = await request.get(`${API_BASE}/api/trpc/events.list`);
    const listBody = await listResponse.json();
    const events = listBody.result.data;

    if (events.length === 0) {
      test.skip();
      return;
    }

    // Get first event ID
    const eventId = events[0].id;

    // Get event detail
    const response = await request.get(
      `${API_BASE}/api/trpc/events.getById?input=${JSON.stringify({ id: eventId })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.result.data).toHaveProperty('id', eventId);
    expect(body.result.data).toHaveProperty('title');
    expect(body.result.data).toHaveProperty('venue');
  });

  test('should filter events by category', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/trpc/events.list?input=${JSON.stringify({ category: ['MUSIC'] })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const events = body.result.data;

    // All events should have MUSIC category
    events.forEach((event: any) => {
      expect(event.category).toContain('MUSIC');
    });
  });

  test('should filter events by date range', async ({ request }) => {
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

    const response = await request.get(
      `${API_BASE}/api/trpc/events.list?input=${JSON.stringify({
        startDate,
        endDate,
      })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const events = body.result.data;

    // All events should be within date range
    events.forEach((event: any) => {
      const eventDate = new Date(event.startDateTime);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(new Date(startDate).getTime());
      expect(eventDate.getTime()).toBeLessThanOrEqual(new Date(endDate).getTime());
    });
  });

  test('should search events by query', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/trpc/events.search?input=${JSON.stringify({ query: 'jazz' })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const events = body.result.data;

    expect(Array.isArray(events)).toBeTruthy();

    // Results should be relevant (if any)
    if (events.length > 0) {
      const firstEvent = events[0];
      const searchableText = `${firstEvent.title} ${firstEvent.description}`.toLowerCase();
      expect(searchableText).toContain('jazz');
    }
  });

  test('should return similar events', async ({ request }) => {
    // Get an event first
    const listResponse = await request.get(`${API_BASE}/api/trpc/events.list`);
    const listBody = await listResponse.json();
    const events = listBody.result.data;

    if (events.length === 0) {
      test.skip();
      return;
    }

    const eventId = events[0].id;

    // Get similar events
    const response = await request.get(
      `${API_BASE}/api/trpc/events.similar?input=${JSON.stringify({ eventId })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const similarEvents = body.result.data;

    expect(Array.isArray(similarEvents)).toBeTruthy();

    // Similar events should not include the original event
    similarEvents.forEach((event: any) => {
      expect(event.id).not.toBe(eventId);
    });
  });

  test('should handle pagination', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/trpc/events.list?input=${JSON.stringify({ limit: 5 })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const events = body.result.data;

    expect(events.length).toBeLessThanOrEqual(5);
  });

  test('should return 404 for non-existent event', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/trpc/events.getById?input=${JSON.stringify({
        id: '00000000-0000-0000-0000-000000000000',
      })}`
    );

    expect(response.status()).toBe(404);
  });

  test('should validate input parameters', async ({ request }) => {
    // Invalid category
    const response = await request.get(
      `${API_BASE}/api/trpc/events.list?input=${JSON.stringify({
        category: ['INVALID_CATEGORY'],
      })}`
    );

    expect(response.status()).toBe(400);
  });
});

test.describe('Venues API - Happy Path', () => {
  const API_BASE = 'http://localhost:3001';

  test('should list venues', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/trpc/venues.list`);

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const venues = body.result.data;

    expect(Array.isArray(venues)).toBeTruthy();
    expect(venues.length).toBeGreaterThan(0);

    // Venues should have required fields
    venues.forEach((venue: any) => {
      expect(venue).toHaveProperty('id');
      expect(venue).toHaveProperty('name');
      expect(venue).toHaveProperty('city');
    });
  });

  test('should get events by venue', async ({ request }) => {
    // Get venues first
    const venuesResponse = await request.get(`${API_BASE}/api/trpc/venues.list`);
    const venuesBody = await venuesResponse.json();
    const venues = venuesBody.result.data;

    if (venues.length === 0) {
      test.skip();
      return;
    }

    const venueId = venues[0].id;

    // Get events at this venue
    const response = await request.get(
      `${API_BASE}/api/trpc/events.list?input=${JSON.stringify({ venueId })}`
    );

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const events = body.result.data;

    // All events should be at the specified venue
    events.forEach((event: any) => {
      expect(event.venueId).toBe(venueId);
    });
  });
});
