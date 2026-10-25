import { describe, expect, it } from 'vitest';
import {
  type BusinessHoursConfig,
  DEFAULT_BUSINESS_HOURS,
  elapsedBusinessHours,
  elapsedCalendarHours,
  slaState,
} from './business-hours';
import { tehranDateTime } from './tehran-day';

const at = (day: string, h: number, m = 0) => tehranDateTime(day, h, m);

describe('elapsedBusinessHours (ADR-0008, decision E6)', () => {
  it('counts only inside the window of one working day', () => {
    // 2026-10-24 is a Saturday: 9–21.
    expect(
      elapsedBusinessHours(at('2026-10-24', 8), at('2026-10-24', 10), DEFAULT_BUSINESS_HOURS),
    ).toBe(1);
    expect(
      elapsedBusinessHours(at('2026-10-24', 20), at('2026-10-24', 23), DEFAULT_BUSINESS_HOURS),
    ).toBe(1);
  });

  it('skips Friday and the closed evening; Thursday closes at 14', () => {
    // Thu 2026-10-22 13:00 → Sat 2026-10-24 10:00 = 1 (Thu) + 0 (Fri) + 1 (Sat).
    expect(
      elapsedBusinessHours(at('2026-10-22', 13), at('2026-10-24', 10), DEFAULT_BUSINESS_HOURS),
    ).toBe(2);
  });

  it('a full working week is 5 × 12 + 5 hours', () => {
    expect(
      elapsedBusinessHours(at('2026-10-24', 0), at('2026-10-31', 0), DEFAULT_BUSINESS_HOURS),
    ).toBe(65);
  });

  it('holidays are closed all day', () => {
    const config: BusinessHoursConfig = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-10-24'] };
    expect(elapsedBusinessHours(at('2026-10-24', 9), at('2026-10-24', 21), config)).toBe(0);
  });

  it('supports fractional hours (13.5 = 13:30)', () => {
    const config: BusinessHoursConfig = {
      ...DEFAULT_BUSINESS_HOURS,
      week: { ...DEFAULT_BUSINESS_HOURS.week, sat: [9, 13.5] },
    };
    expect(elapsedBusinessHours(at('2026-10-24', 0), at('2026-10-24', 23), config)).toBe(4.5);
  });

  it('is 0 for an empty or reversed range', () => {
    const t = at('2026-10-24', 10);
    expect(elapsedBusinessHours(t, t, DEFAULT_BUSINESS_HOURS)).toBe(0);
    expect(elapsedBusinessHours(t, at('2026-10-24', 9), DEFAULT_BUSINESS_HOURS)).toBe(0);
  });
});

describe('slaState', () => {
  it('business clock: breached past the threshold, warning in the last 25 %', () => {
    const since = at('2026-10-24', 9);
    const fine = slaState(since, at('2026-10-24', 12), 24, 'business', DEFAULT_BUSINESS_HOURS);
    expect(fine).toEqual({ elapsedHours: 3, remainingHours: 21, breached: false, warning: false });
    // Sat 12 h + Sun 7 h = 19 h of 24 → 5 h left (< 6 = 25 %) → warning.
    const warn = slaState(since, at('2026-10-25', 16), 24, 'business', DEFAULT_BUSINESS_HOURS);
    expect(warn.warning).toBe(true);
    expect(warn.breached).toBe(false);
    const late = slaState(since, at('2026-10-26', 12), 24, 'business', DEFAULT_BUSINESS_HOURS);
    expect(late.breached).toBe(true);
    expect(late.remainingHours).toBeLessThan(0);
  });

  it('calendar clock counts every hour', () => {
    const since = new Date('2026-10-23T00:00:00Z');
    expect(elapsedCalendarHours(since, new Date('2026-10-24T00:00:00Z'))).toBe(24);
    expect(
      slaState(since, new Date('2026-10-25T01:00:00Z'), 48, 'calendar', DEFAULT_BUSINESS_HOURS)
        .breached,
    ).toBe(true);
  });
});
