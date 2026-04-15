import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deduplicateEvent } from '../../src/lib/deduplicator';
import { NormalizedEvent } from '../../src/types';

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    event: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    eventSource: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
    eventDuplicate: {
      upsert: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
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
}));

describe('deduplicateEvent', () => {
  const mockEvent: NormalizedEvent = {
    title: 'Test Event',
    normalizedTitle: 'test event',
    description: 'A test event',
    startDateTime: new Date('2025-12-25T20:00:00'),
    timezone: 'America/Los_Angeles',
    venueId: 'venue-123',
    venueName: 'Test Venue',
    category: ['music'],
    tags: ['test'],
    images: [],
    isFree: false,
    sourceUrl: 'https://test.com',
    sourceName: 'test-scraper',
    rawData: {},
  };

  const mockEmbedding = new Array(1536).fill(0.1);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new event when no duplicates found', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const mockPrisma = new PrismaClient();

    // Mock no similar events found
    vi.mocked(mockPrisma.$queryRawUnsafe).mockResolvedValue([]);

    // Mock event creation
    vi.mocked(mockPrisma.event.create).mockResolvedValue({
      id: 'event-123',
      ...mockEvent,
    } as any);

    vi.mocked(mockPrisma.eventSource.create).mockResolvedValue({} as any);

    const result = await deduplicateEvent(mockEvent, mockEmbedding);

    expect(result).toMatchObject({
      isDuplicate: false,
      eventId: 'event-123',
      action: 'create',
    });
  });

  it('should merge when high similarity (>0.9)', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const mockPrisma = new PrismaClient();

    // Mock high similarity match
    vi.mocked(mockPrisma.$queryRawUnsafe).mockResolvedValue([
      {
        id: 'existing-event-123',
        title: 'Test Event',
        similarity: 0.95,
      },
    ]);

    vi.mocked(mockPrisma.event.update).mockResolvedValue({} as any);
    vi.mocked(mockPrisma.eventSource.upsert).mockResolvedValue({} as any);
    vi.mocked(mockPrisma.eventDuplicate.upsert).mockResolvedValue({} as any);

    const result = await deduplicateEvent(mockEvent, mockEmbedding);

    expect(result).toMatchObject({
      isDuplicate: true,
      eventId: 'existing-event-123',
      similarityScore: 0.95,
      action: 'merge',
    });
  });

  it('should flag for review when medium similarity (0.7-0.9)', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const mockPrisma = new PrismaClient();

    // Mock medium similarity match
    vi.mocked(mockPrisma.$queryRawUnsafe).mockResolvedValue([
      {
        id: 'existing-event-456',
        title: 'Similar Event',
        similarity: 0.8,
      },
    ]);

    vi.mocked(mockPrisma.event.create).mockResolvedValue({
      id: 'new-event-789',
      ...mockEvent,
    } as any);

    vi.mocked(mockPrisma.eventSource.create).mockResolvedValue({} as any);
    vi.mocked(mockPrisma.eventDuplicate.upsert).mockResolvedValue({} as any);

    const result = await deduplicateEvent(mockEvent, mockEmbedding);

    expect(result).toMatchObject({
      isDuplicate: true,
      eventId: 'new-event-789',
      similarityScore: 0.8,
      action: 'flag',
    });
  });
});
