/**
 * Timezone-safe parsing of LLM-produced event datetimes.
 *
 * The normalizer prompts gpt-4o-mini for a Pacific-time `startDate` but the
 * model commonly returns a bare wall-clock string with no offset
 * (e.g. "2026-06-26T19:30:00"). `new Date("2026-06-26T19:30:00")` parses that
 * in the PROCESS's local zone — which is UTC on Railway — so a 7:30 PM Pacific
 * show became 7:30 PM UTC (12:30 PM Pacific). When the scrape ran later that
 * afternoon, the event looked like it was in the past and the deduplicator
 * dropped it ("Event is in the past") before it was ever stored.
 *
 * `parseEventDate` fixes that: a bare wall-clock is interpreted in the venue's
 * zone (Pacific), while an explicit offset / Z is honored as-is. The result is
 * independent of the server's local timezone.
 *
 * Dependency-free (Intl + Date, Node 20+).
 */

export const APP_TIMEZONE = 'America/Los_Angeles';

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

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
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some engines emit '24' for midnight
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/**
 * The UTC instant for a wall-clock time in `timeZone`, via the
 * offset-difference method (exact for ordinary event times; only ambiguous
 * inside the 02:00 DST transition window, which event start times avoid).
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const seen = getZonedParts(new Date(asUtc), timeZone);
  const seenAsUtc = Date.UTC(
    seen.year,
    seen.month - 1,
    seen.day,
    seen.hour,
    seen.minute,
    seen.second,
  );
  const offset = seenAsUtc - asUtc; // how far the zone is ahead of UTC, in ms
  return new Date(asUtc - offset);
}

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Parse an LLM-produced event datetime into a UTC `Date`, independent of the
 * server's local timezone.
 *
 * - Explicit offset or `Z` ("…-07:00", "…Z")  → honored as an absolute instant.
 * - Bare wall-clock ("2026-06-26T19:30:00")    → interpreted in `timeZone`.
 * - Date only ("2026-06-26")                   → 19:00 in `timeZone` (matches
 *   the normalizer prompt's "if only a date, default to 19:00").
 * - Anything else                              → best-effort `new Date(str)`.
 *
 * Returns an Invalid Date (caller filters on `isNaN(getTime())`) for empty or
 * unparseable input — same contract the existing pipeline already expects.
 */
export function parseEventDate(
  value: string | null | undefined,
  timeZone: string = APP_TIMEZONE,
): Date {
  if (!value || typeof value !== 'string') return new Date(NaN);
  const s = value.trim();

  if (OFFSET_SUFFIX.test(s)) return new Date(s);

  const dateOnly = s.match(DATE_ONLY);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return zonedTimeToUtc(timeZone, +y, +mo, +d, 19, 0, 0);
  }

  const wall = s.match(WALL_CLOCK);
  if (wall) {
    const [, y, mo, d, h, mi, sec] = wall;
    return zonedTimeToUtc(timeZone, +y, +mo, +d, +h, +mi, sec ? +sec : 0);
  }

  return new Date(s);
}
