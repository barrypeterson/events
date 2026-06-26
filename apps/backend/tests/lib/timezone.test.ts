import { describe, it, expect } from 'vitest';
import {
  APP_TIMEZONE,
  getZonedParts,
  startOfDayInZone,
  endOfDayInZone,
  timeOfDayInZone,
  zonedTimeToUtc,
} from '../../src/lib/timezone';

/**
 * These assertions must hold regardless of the server's local TZ. On Railway
 * the server runs in UTC; the regression these guard against is day boundaries
 * computed in UTC instead of Pacific, which dropped evening events from the
 * Tonight / Weekend views.
 */
describe('timezone helpers', () => {
  it('reads wall-clock parts in Pacific, not the server zone', () => {
    // 2026-06-26 22:22 UTC = 3:22 PM PDT
    const parts = getZonedParts(new Date('2026-06-26T22:22:40Z'));
    expect(parts).toMatchObject({ year: 2026, month: 6, day: 26, hour: 15, weekday: 5 });
  });

  it('computes PDT (summer) day boundaries as UTC instants', () => {
    const now = new Date('2026-06-26T22:22:40Z');
    expect(startOfDayInZone(now).toISOString()).toBe('2026-06-26T07:00:00.000Z');
    expect(endOfDayInZone(now).toISOString()).toBe('2026-06-27T06:59:59.999Z');
    expect(timeOfDayInZone(now, 4).toISOString()).toBe('2026-06-26T11:00:00.000Z');
  });

  it('computes PST (winter) day boundaries as UTC instants', () => {
    const now = new Date('2026-01-15T20:00:00Z'); // noon PST
    expect(startOfDayInZone(now).toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(endOfDayInZone(now).toISOString()).toBe('2026-01-16T07:59:59.999Z');
  });

  it('is correct across the spring-forward DST transition', () => {
    // 2026-03-08: midnight is still PST (-8), 23:59 is already PDT (-7).
    const springDay = new Date('2026-03-08T18:00:00Z');
    expect(startOfDayInZone(springDay).toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(endOfDayInZone(springDay).toISOString()).toBe('2026-03-09T06:59:59.999Z');
  });

  it('keeps an evening Pacific event inside the same Pacific day window', () => {
    // The bug report: "Vince Cimo" — 7:30 PM PDT Jun 26 — vanished from Tonight.
    const now = new Date('2026-06-26T22:22:40Z'); // 3:22 PM PDT
    const eventStart = zonedTimeToUtc(APP_TIMEZONE, 2026, 6, 26, 19, 30); // 7:30 PM PDT
    expect(eventStart.toISOString()).toBe('2026-06-27T02:30:00.000Z');
    expect(eventStart >= startOfDayInZone(now)).toBe(true);
    expect(eventStart <= endOfDayInZone(now)).toBe(true);
  });

  it('shifts whole days correctly for the weekend window', () => {
    const wed = new Date('2026-06-24T20:00:00Z'); // 1 PM PDT, Wednesday
    expect(getZonedParts(wed).weekday).toBe(3);
    // 3 days to Saturday, Sunday ends on day 4.
    expect(startOfDayInZone(wed, APP_TIMEZONE, 3).toISOString()).toBe('2026-06-27T07:00:00.000Z');
    expect(endOfDayInZone(wed, APP_TIMEZONE, 4).toISOString()).toBe('2026-06-29T06:59:59.999Z');
  });
});
