import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FremontTheaterScraper } from '../../src/scrapers/fremont-theater';

// Mock fetchWithRetry
vi.mock('../../src/lib/scraper-utils', () => ({
  fetchWithRetry: vi.fn(),
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  cleanText: (text: string) => text.trim(),
  rateLimiter: {
    waitIfNeeded: vi.fn(),
  },
}));

describe('FremontTheaterScraper', () => {
  let scraper: FremontTheaterScraper;

  beforeEach(() => {
    scraper = new FremontTheaterScraper();
    vi.clearAllMocks();
  });

  it('should have correct configuration', () => {
    expect(scraper.name).toBe('fremont-theater');
    expect(scraper.sourceUrl).toBe('https://www.fremontslo.com/shows');
    expect(scraper.schedule).toBe('0 */6 * * *');
  });

  it('should parse event listings from HTML', async () => {
    const mockHtml = `
      <div class="event-item">
        <h2 class="event-title">Test Concert</h2>
        <div class="event-date">December 25, 2025</div>
        <div class="event-time">8:00 PM</div>
        <div class="event-description">A great show</div>
        <div class="event-price">$25</div>
        <img src="/image.jpg" />
        <a class="ticket-link" href="/tickets">Buy Tickets</a>
      </div>
    `;

    const { fetchWithRetry } = await import('../../src/lib/scraper-utils');
    vi.mocked(fetchWithRetry).mockResolvedValue(mockHtml);

    const events = await scraper.scrape();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Test Concert',
      rawDate: 'December 25, 2025',
      rawTime: '8:00 PM',
      rawDescription: 'A great show',
      rawVenue: 'Fremont Theater',
      rawPrice: '$25',
    });
  });

  it('should handle empty results', async () => {
    const mockHtml = '<div>No events</div>';

    const { fetchWithRetry } = await import('../../src/lib/scraper-utils');
    vi.mocked(fetchWithRetry).mockResolvedValue(mockHtml);

    const events = await scraper.scrape();

    expect(events).toHaveLength(0);
  });

  it('should handle scraping errors', async () => {
    const { fetchWithRetry } = await import('../../src/lib/scraper-utils');
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('Network error'));

    await expect(scraper.scrape()).rejects.toThrow('Network error');
  });
});
