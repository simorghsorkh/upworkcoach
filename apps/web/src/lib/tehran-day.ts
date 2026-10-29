/**
 * Calendar days in the Tehran calendar (ADR-0008: dates without a time mean a Tehran day).
 * A fixed-zone view of `org-day` (ADR-0013 section 5); every organization is in Tehran for
 * now, and services move to the organization's zone one by one. Pure; works in the browser.
 */
import {
  addDays,
  dateTimeIn,
  dayEndIn,
  dayIn,
  dayRangeIn,
  dayStartIn,
  partsIn,
  type Weekday,
  weekdayOf,
} from './org-day';

export const TEHRAN_TZ = 'Asia/Tehran';

export { addDays };

/** `YYYY-MM-DD` of the Tehran day that contains `instant`. */
export function tehranDay(instant: Date = new Date()): string {
  return dayIn(TEHRAN_TZ, instant);
}

export type TehranWeekday = Weekday;

/** Tehran wall-clock parts of an instant. */
export function tehranParts(instant: Date): ReturnType<typeof partsIn> {
  return partsIn(TEHRAN_TZ, instant);
}

/** Weekday of a Tehran calendar day `YYYY-MM-DD`. */
export function tehranWeekday(day: string): TehranWeekday {
  return weekdayOf(TEHRAN_TZ, day);
}

/** The instant of a Tehran wall-clock time on a Tehran calendar day. */
export function tehranDateTime(day: string, hour: number, minute = 0, second = 0): Date {
  return dateTimeIn(TEHRAN_TZ, day, hour, minute, second);
}

/** First instant of a Tehran day (00:00:00 Tehran). */
export function tehranDayStart(day: string): Date {
  return dayStartIn(TEHRAN_TZ, day);
}

/**
 * Task deadline of a chosen day (ADR-0008): 23:59:59 Tehran of that day, as UTC.
 */
export function tehranDayEnd(day: string): Date {
  return dayEndIn(TEHRAN_TZ, day);
}

/** `[start of today, start of tomorrow)` in Tehran (ADR-0008 «امروز»). */
export function tehranDayRange(instant: Date = new Date()): { start: Date; end: Date } {
  return dayRangeIn(TEHRAN_TZ, instant);
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
