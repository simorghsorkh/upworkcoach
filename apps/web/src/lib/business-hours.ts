import {
  addDays,
  type TehranWeekday,
  tehranDateTime,
  tehranDay,
  tehranWeekday,
} from './tehran-day';

/**
 * Business-hours clock for the team SLA (ADR-0008, mentor-workflow.md section 4, decision
 * E6 = business hours). Pure: no I/O; the config comes from `settings.business_hours`.
 *
 * A day's window is `[startHour, endHour)` in Tehran wall-clock hours (fractions allowed,
 * e.g. 13.5 = 13:30). `null` = closed (Friday by default). Holidays are Tehran days
 * `YYYY-MM-DD` that are closed all day.
 */
export type BusinessHoursConfig = {
  timezone: 'Asia/Tehran';
  week: Record<TehranWeekday, [number, number] | null>;
  holidays: string[];
};

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: 'Asia/Tehran',
  week: {
    sat: [9, 21],
    sun: [9, 21],
    mon: [9, 21],
    tue: [9, 21],
    wed: [9, 21],
    thu: [9, 14],
    fri: null,
  },
  holidays: [],
};

const HOUR_MS = 3600 * 1000;
/** Guard against absurd ranges (e.g. a 1970 timestamp): at most ~10 years of days. */
const MAX_DAYS = 3700;

function windowOf(day: string, config: BusinessHoursConfig): { start: Date; end: Date } | null {
  if (config.holidays.includes(day)) return null;
  const hours = config.week[tehranWeekday(day)];
  if (!hours) return null;
  const [from, to] = hours;
  if (!(to > from)) return null;
  const at = (h: number) => {
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    return tehranDateTime(day, whole, minutes, 0);
  };
  return { start: at(from), end: at(to) };
}

/** Business hours between two instants (0 when `to <= from`). */
export function elapsedBusinessHours(from: Date, to: Date, config: BusinessHoursConfig): number {
  if (to.getTime() <= from.getTime()) return 0;
  let total = 0;
  let day = tehranDay(from);
  const last = tehranDay(to);
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const window = windowOf(day, config);
    if (window) {
      const start = Math.max(window.start.getTime(), from.getTime());
      const end = Math.min(window.end.getTime(), to.getTime());
      if (end > start) total += end - start;
    }
    if (day === last) break;
    day = addDays(day, 1);
  }
  return total / HOUR_MS;
}

/** Calendar hours between two instants (0 when `to <= from`). */
export function elapsedCalendarHours(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / HOUR_MS);
}

export type SlaClock = 'business' | 'calendar';

/**
 * SLA state of one waiting item (data-model.md 4-3): elapsed hours on the chosen clock,
 * `breached` past the threshold, `warning` when less than 25 % of it is left.
 */
export function slaState(
  since: Date,
  now: Date,
  slaHours: number,
  clock: SlaClock,
  config: BusinessHoursConfig,
): { elapsedHours: number; remainingHours: number; breached: boolean; warning: boolean } {
  const elapsed =
    clock === 'business'
      ? elapsedBusinessHours(since, now, config)
      : elapsedCalendarHours(since, now);
  const elapsedHours = Math.round(elapsed * 10) / 10;
  const remainingHours = Math.round((slaHours - elapsed) * 10) / 10;
  return {
    elapsedHours,
    remainingHours,
    breached: elapsed > slaHours,
    warning: elapsed <= slaHours && slaHours - elapsed < slaHours * 0.25,
  };
}
