import { describe, it, expect } from 'vitest';
import { parseEventDate, zonedTimeToUtc, APP_TIMEZONE } from '../../src/lib/timezone';

/**
 * These assertions must produce the same UTC instant regardless of the
 * process's local timezone. The regression they guard: on Railway (UTC),
 * `new Date("2026-06-26T19:30:00")` was read as 19:30 UTC, shifting evening
 * Pacific events ~7h earlier so the deduplicator dropped them as "past".
 *
 * Run under both `TZ=UTC` and `TZ=America/Los_Angeles` to prove invariance.
 */
describe('parseEventDate', () => {
  it('interprets a bare wall-clock as Pacific (PDT / summer)', () => {
    expect(parseEventDate('2026-06-26T19:30:00').toISOString()).toBe('2026-06-27T02:30:00.000Z');
  });

  it('interprets a bare wall-clock as Pacific (PST / winter)', () => {
    expect(parseEventDate('2026-01-15T19:30:00').toISOString()).toBe('2026-01-16T03:30:00.000Z');
  });

  it('honors an explicit offset', () => {
    expect(parseEventDate('2026-06-26T19:30:00-07:00').toISOString()).toBe(
      '2026-06-27T02:30:00.000Z',
    );
  });

  it('honors an explicit Z (UTC)', () => {
    expect(parseEventDate('2026-06-26T19:30:00Z').toISOString()).toBe('2026-06-26T19:30:00.000Z');
  });

  it('defaults a date-only value to 19:00 Pacific', () => {
    expect(parseEventDate('2026-06-26').toISOString()).toBe('2026-06-27T02:00:00.000Z');
  });

  it('returns an Invalid Date for empty / garbage input', () => {
    expect(isNaN(parseEventDate('').getTime())).toBe(true);
    expect(isNaN(parseEventDate(null).getTime())).toBe(true);
    expect(isNaN(parseEventDate('not a date').getTime())).toBe(true);
  });

  it('keeps an evening Pacific event in the future relative to an afternoon scrape', () => {
    // The bug report: "Vince Cimo", 7:30 PM PDT Jun 26, scraped 3:22 PM PDT.
    const scrapedAt = new Date('2026-06-26T22:22:40Z'); // 3:22 PM PDT
    const start = parseEventDate('2026-06-26T19:30:00');
    expect(start.toISOString()).toBe('2026-06-27T02:30:00.000Z');
    expect(start < scrapedAt).toBe(false); // NOT past → not dropped
  });

  it('zonedTimeToUtc is correct across the spring-forward DST boundary', () => {
    // 2026-03-08: midnight is still PST (-8); 23:00 is already PDT (-7).
    expect(zonedTimeToUtc(APP_TIMEZONE, 2026, 3, 8, 0, 0, 0).toISOString()).toBe(
      '2026-03-08T08:00:00.000Z',
    );
    expect(zonedTimeToUtc(APP_TIMEZONE, 2026, 3, 8, 23, 0, 0).toISOString()).toBe(
      '2026-03-09T06:00:00.000Z', // 23:00 is already PDT (−7) after the 2 AM jump
    );
  });
});
