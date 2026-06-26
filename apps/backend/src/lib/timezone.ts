/**
 * Timezone helpers for computing day boundaries in the venues' local zone.
 *
 * Every SLO Events venue is in San Luis Obispo, so "today", "tonight", and
 * "this weekend" must be reckoned in Pacific time — NOT the server's local
 * zone. On Railway the server runs in UTC, so the previous `setHours()` /
 * `getHours()` based math placed "end of today" at 23:59 UTC (≈4:59 PM
 * Pacific) and silently dropped every Pacific-evening event from the Tonight
 * and Weekend views.
 *
 * These helpers are dependency-free (Intl + Date, available on Node 20+) so
 * the backend doesn't take on a date library for a handful of boundary
 * calculations.
 */

export const APP_TIMEZONE = 'America/Los_Angeles';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** The wall-clock parts of `instant` as observed in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string = APP_TIMEZONE): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  // Some engines render midnight as hour '24'; normalize to 0.
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: WEEKDAY_INDEX[map.weekday],
  };
}

/**
 * The UTC instant corresponding to a wall-clock time in `timeZone`.
 *
 * Uses the offset-difference method: interpret the wall-clock as if it were
 * UTC, measure how far that lands from the requested wall-clock when viewed
 * back in the zone, then correct by that delta. A single correction is exact
 * for day-boundary times (00:00, 04:00, 23:59), which never coincide with the
 * 02:00 US DST transition where a wall-clock can be ambiguous or nonexistent.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const seen = getZonedParts(new Date(asUtc), timeZone);
  const seenAsUtc = Date.UTC(
    seen.year,
    seen.month - 1,
    seen.day,
    seen.hour,
    seen.minute,
    seen.second,
    millisecond,
  );
  const offset = seenAsUtc - asUtc; // how far the zone is ahead of UTC, in ms
  return new Date(asUtc - offset);
}

/** Calendar date (in `timeZone`) of `instant`, shifted by `days`. */
function zonedDatePlusDays(
  instant: Date,
  days: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const { year, month, day } = getZonedParts(instant, timeZone);
  // Date.UTC normalizes month/year rollover for us.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Start of day (00:00:00.000) for `instant`'s date in `timeZone`, as a UTC instant. */
export function startOfDayInZone(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
  plusDays = 0,
): Date {
  const { year, month, day } = zonedDatePlusDays(instant, plusDays, timeZone);
  return zonedTimeToUtc(timeZone, year, month, day, 0, 0, 0, 0);
}

/** End of day (23:59:59.999) for `instant`'s date in `timeZone`, as a UTC instant. */
export function endOfDayInZone(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
  plusDays = 0,
): Date {
  const { year, month, day } = zonedDatePlusDays(instant, plusDays, timeZone);
  return zonedTimeToUtc(timeZone, year, month, day, 23, 59, 59, 999);
}

/** A specific wall-clock time on `instant`'s date in `timeZone`, as a UTC instant. */
export function timeOfDayInZone(
  instant: Date,
  hour: number,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone: string = APP_TIMEZONE,
): Date {
  const { year, month, day } = getZonedParts(instant, timeZone);
  return zonedTimeToUtc(timeZone, year, month, day, hour, minute, second, millisecond);
}
