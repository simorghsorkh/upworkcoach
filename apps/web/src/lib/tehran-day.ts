/**
 * Calendar days in the Tehran calendar (ADR-0008: dates without a time mean a Tehran day).
 * Pure; works in the browser too. All offsets come from the IANA tzdata of the runtime
 * (`Asia/Tehran`), never from a hard-coded +03:30.
 */
export const TEHRAN_TZ = 'Asia/Tehran';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
});

/** `YYYY-MM-DD` of the Tehran day that contains `instant`. */
export function tehranDay(instant: Date = new Date()): string {
  return formatter.format(instant);
}

export type TehranWeekday = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

const WEEKDAYS: Record<string, TehranWeekday> = {
  Sat: 'sat',
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
};

/** Tehran wall-clock parts of an instant. */
export function tehranParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: TehranWeekday;
} {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
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

/** Weekday of a Tehran calendar day `YYYY-MM-DD`. */
export function tehranWeekday(day: string): TehranWeekday {
  return tehranParts(tehranDateTime(day, 12, 0, 0)).weekday;
}

function parseDay(day: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`invalid day: ${day}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Offset of Tehran from UTC at `instant`, in milliseconds (e.g. +3.5 h). */
function tehranOffsetMs(instant: Date): number {
  const p = tehranParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of a Tehran wall-clock time on a Tehran calendar day. */
export function tehranDateTime(day: string, hour: number, minute = 0, second = 0): Date {
  const [y, m, d] = parseDay(day);
  const wall = Date.UTC(y, m - 1, d, hour, minute, second);
  // Two passes settle the offset even around a (historic) DST change.
  let guess = wall - tehranOffsetMs(new Date(wall));
  guess = wall - tehranOffsetMs(new Date(guess));
  return new Date(guess);
}

/** First instant of a Tehran day (00:00:00 Tehran). */
export function tehranDayStart(day: string): Date {
  return tehranDateTime(day, 0, 0, 0);
}

/**
 * Task deadline of a chosen day (ADR-0008): 23:59:59 Tehran of that day, as UTC.
 */
export function tehranDayEnd(day: string): Date {
  return tehranDateTime(day, 23, 59, 59);
}

/** `day` plus `n` calendar days (`n` may be negative). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** `[start of today, start of tomorrow)` in Tehran (ADR-0008 «امروز»). */
export function tehranDayRange(instant: Date = new Date()): { start: Date; end: Date } {
  const today = tehranDay(instant);
  return { start: tehranDayStart(today), end: tehranDayStart(addDays(today, 1)) };
}

const jalaliFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Jalali date `YYYY/MM/DD` (Latin digits) of the Tehran day of an instant — for CSV. */
export function jalaliDate(instant: Date): string {
  const parts = Object.fromEntries(
    jalaliFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}/${parts.month}/${parts.day}`;
}
