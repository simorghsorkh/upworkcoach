/**
 * Calendar days in an organization's time zone (ADR-0013 section 5, generalizing ADR-0008:
 * a date without a time means a day in the organization's zone). Pure; works in the browser
 * too. Offsets come from the IANA tzdata of the runtime, never from a hard-coded offset, so
 * daylight-saving changes (Europe/Amsterdam) are handled.
 */

export type Weekday = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

const WEEKDAYS: Record<string, Weekday> = {
  Sat: 'sat',
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
};

type Formatters = { day: Intl.DateTimeFormat; parts: Intl.DateTimeFormat };
const formatters = new Map<string, Formatters>();

function formattersOf(timeZone: string): Formatters {
  let f = formatters.get(timeZone);
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
      parts: new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'short',
      }),
    };
    formatters.set(timeZone, f);
  }
  return f;
}

/** `YYYY-MM-DD` of the day in `timeZone` that contains `instant`. */
export function dayIn(timeZone: string, instant: Date = new Date()): string {
  return formattersOf(timeZone).day.format(instant);
}

/** Wall-clock parts of an instant in `timeZone`. */
export function partsIn(
  timeZone: string,
  instant: Date,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Weekday;
} {
  const parts = Object.fromEntries(
    formattersOf(timeZone)
      .parts.formatToParts(instant)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 'sat',
  };
}

/** Weekday of a calendar day `YYYY-MM-DD` (the same in every zone). */
export function weekdayOf(timeZone: string, day: string): Weekday {
  return partsIn(timeZone, dateTimeIn(timeZone, day, 12, 0, 0)).weekday;
}

function parseDay(day: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`invalid day: ${day}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (e.g. +3.5 h for Tehran). */
function offsetMs(timeZone: string, instant: Date): number {
  const p = partsIn(timeZone, instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of a wall-clock time on a calendar day in `timeZone`. */
export function dateTimeIn(
  timeZone: string,
  day: string,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  const [y, m, d] = parseDay(day);
  const wall = Date.UTC(y, m - 1, d, hour, minute, second);
  // Two passes settle the offset around a daylight-saving change.
  let guess = wall - offsetMs(timeZone, new Date(wall));
  guess = wall - offsetMs(timeZone, new Date(guess));
  return new Date(guess);
}

/** First instant of a day (00:00:00 in `timeZone`). */
export function dayStartIn(timeZone: string, day: string): Date {
  return dateTimeIn(timeZone, day, 0, 0, 0);
}

/** Task deadline of a chosen day (ADR-0008): 23:59:59 of that day in `timeZone`, as UTC. */
export function dayEndIn(timeZone: string, day: string): Date {
  return dateTimeIn(timeZone, day, 23, 59, 59);
}

/** `day` plus `n` calendar days (`n` may be negative). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** `[start of today, start of tomorrow)` in `timeZone` (23 or 25 hours on a DST change). */
export function dayRangeIn(
  timeZone: string,
  instant: Date = new Date(),
): { start: Date; end: Date } {
  const today = dayIn(timeZone, instant);
  return { start: dayStartIn(timeZone, today), end: dayStartIn(timeZone, addDays(today, 1)) };
}

/** Whole calendar days in `timeZone` between two instants (0 = same day). */
export function daysBetweenIn(timeZone: string, earlier: Date, later: Date): number {
  const toUtc = (d: Date) => Date.parse(`${dayIn(timeZone, d)}T00:00:00Z`);
  return Math.round((toUtc(later) - toUtc(earlier)) / 86_400_000);
}
