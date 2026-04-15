import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseClaudeResponse, validateAndMapEvents } from '../../src/lib/claude-scraper-utils';

describe('parseClaudeResponse', () => {
  it('parses a clean JSON array response', () => {
    const response = '[{"title":"Jazz Night","rawDate":"2026-04-01"}]';
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Jazz Night');
  });

  it('handles markdown code fences around JSON', () => {
    const response = '```json\n[{"title":"Jazz Night","rawDate":"2026-04-01"}]\n```';
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Jazz Night');
  });

  it('handles markdown code fences without json label', () => {
    const response = '```\n[{"title":"Jazz Night","rawDate":"2026-04-01"}]\n```';
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(1);
  });

  it('extracts JSON from surrounding text', () => {
    const response = 'Here are the events I found:\n[{"title":"Jazz Night","rawDate":"2026-04-01"}]\nThat is all.';
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    expect(parseClaudeResponse('', 'test')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseClaudeResponse('   \n  ', 'test')).toEqual([]);
  });

  it('returns empty array when no JSON array found', () => {
    const response = 'I could not find any events on this page.';
    expect(parseClaudeResponse(response, 'test')).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    const response = '[{"title":"Jazz Night", "rawDate":}]';
    expect(parseClaudeResponse(response, 'test')).toEqual([]);
  });

  it('handles response with just empty array', () => {
    expect(parseClaudeResponse('[]', 'test')).toEqual([]);
  });

  it('parses multiple events', () => {
    const response = JSON.stringify([
      { title: 'Event 1', rawDate: '2026-04-01' },
      { title: 'Event 2', rawDate: '2026-04-02' },
      { title: 'Event 3', rawDate: '2026-04-03' },
    ]);
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(3);
  });

  it('handles JSON with nested objects and arrays', () => {
    const response = '[{"title":"Event","rawDate":"2026-04-01","metadata":{"tags":["music","live"]}}]';
    const result = parseClaudeResponse(response, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].metadata.tags).toEqual(['music', 'live']);
  });
});

describe('validateAndMapEvents', () => {
  const baseOptions = {
    scraperName: 'test-scraper',
    venueName: 'Test Venue',
    extractionMethod: 'test',
  };

  it('filters out events without title', () => {
    const events = [
      { title: 'Valid Event', rawDate: '2026-04-01' },
      { rawDate: '2026-04-02' }, // missing title
    ];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid Event');
  });

  it('filters out events without rawDate', () => {
    const events = [
      { title: 'Valid Event', rawDate: '2026-04-01' },
      { title: 'No Date Event' }, // missing rawDate
    ];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result).toHaveLength(1);
  });

  it('maps fields correctly to RawEvent format', () => {
    const events = [{
      title: 'Jazz Night',
      rawDate: 'April 1, 2026',
      rawTime: '8:00 PM',
      rawDescription: 'Live jazz music',
      rawPrice: '$20',
      imageUrl: 'https://example.com/img.jpg',
      url: 'https://example.com/event',
    }];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Jazz Night',
      rawDate: 'April 1, 2026',
      rawTime: '8:00 PM',
      rawDescription: 'Live jazz music',
      rawVenue: 'Test Venue',
      rawPrice: '$20',
      imageUrl: 'https://example.com/img.jpg',
      url: 'https://example.com/event',
    });
    expect(result[0].metadata).toMatchObject({
      source: 'test-scraper',
      extractionMethod: 'test',
    });
  });

  it('filters out past events with parseable dates', () => {
    const events = [
      { title: 'Past Event', rawDate: '2020-01-01' },
      { title: 'Future Event', rawDate: '2030-01-01' },
    ];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Future Event');
  });

  it('keeps events with unparseable dates', () => {
    const events = [
      { title: 'Vague Date Event', rawDate: 'Next Thursday' },
    ];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result).toHaveLength(1);
  });

  it('handles description fallback from description to rawDescription', () => {
    const events = [{
      title: 'Event',
      rawDate: '2026-04-01',
      description: 'Fallback desc',
    }];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result[0].rawDescription).toBe('Fallback desc');
  });

  it('handles price fallback from price to rawPrice', () => {
    const events = [{
      title: 'Event',
      rawDate: '2026-04-01',
      price: '$15',
    }];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result[0].rawPrice).toBe('$15');
  });

  it('logs warning for suspicious URL domain when sourceDomain provided', () => {
    const events = [{
      title: 'Event',
      rawDate: '2026-04-01',
      url: 'https://suspicious-site.com/event',
    }];
    // Should not throw, just log
    const result = validateAndMapEvents(events, {
      ...baseOptions,
      sourceDomain: 'example.com',
    });
    expect(result).toHaveLength(1);
  });

  it('includes elementRef in metadata when present', () => {
    const events = [{
      title: 'Event',
      rawDate: '2026-04-01',
      elementRef: '@e5',
    }];
    const result = validateAndMapEvents(events, baseOptions);
    expect(result[0].metadata?.elementRef).toBe('@e5');
  });

  it('returns empty array for empty input', () => {
    expect(validateAndMapEvents([], baseOptions)).toEqual([]);
  });
});
