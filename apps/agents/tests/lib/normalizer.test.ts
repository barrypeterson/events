import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeEvent } from '../../src/lib/normalizer';
import { RawEvent } from '../../src/types';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

// Mock logger
vi.mock('../../src/lib/scraper-utils', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  cleanText: (text: string) => text.trim(),
  normalizeString: (text: string) => text.toLowerCase().trim(),
}));

describe('normalizeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should normalize raw event data', async () => {
    const rawEvent: RawEvent = {
      title: 'Test Concert',
      rawDate: 'December 25, 2025',
      rawTime: '8:00 PM',
      rawDescription: 'A great show',
      rawVenue: 'Test Venue',
      rawPrice: '$25',
    };

    const mockClaudeResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: 'Test Concert',
            description: 'A great show',
            startDate: '2025-12-25T20:00:00',
            venueName: 'Test Venue',
            category: ['music'],
            tags: ['concert', 'live music'],
            priceMin: 25,
            priceMax: 25,
            isFree: false,
          }),
        },
      ],
    };

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue(mockClaudeResponse);
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: {
            create: mockCreate,
          },
        } as any)
    );

    const normalized = await normalizeEvent(rawEvent, 'test-scraper', 'https://test.com');

    expect(normalized).toMatchObject({
      title: 'Test Concert',
      description: 'A great show',
      venueName: 'Test Venue',
      category: ['music'],
      tags: ['concert', 'live music'],
      priceMin: 25,
      isFree: false,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
      })
    );
  });

  it('should handle normalization errors', async () => {
    const rawEvent: RawEvent = {
      title: 'Test Event',
    };

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockCreate = vi.fn().mockRejectedValue(new Error('API error'));
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: {
            create: mockCreate,
          },
        } as any)
    );

    await expect(
      normalizeEvent(rawEvent, 'test-scraper', 'https://test.com')
    ).rejects.toThrow('Event normalization failed');
  });
});
