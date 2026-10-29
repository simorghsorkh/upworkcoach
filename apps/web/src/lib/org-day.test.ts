import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateTimeIn,
  dayEndIn,
  dayIn,
  dayRangeIn,
  dayStartIn,
  daysBetweenIn,
  partsIn,
  weekdayOf,
} from './org-day';
import { tehranDay, tehranDayEnd, tehranDayRange } from './tehran-day';

const TEHRAN = 'Asia/Tehran';
const AMSTERDAM = 'Europe/Amsterdam';

describe('org-day in Tehran (same results as tehran-day)', () => {
  it('day boundaries at +03:30', () => {
    const instant = new Date('2026-10-27T21:00:00Z'); // 00:30 on the 28th in Tehran
    expect(dayIn(TEHRAN, instant)).toBe('2026-10-28');
    expect(tehranDay(instant)).toBe('2026-10-28');
    expect(dayStartIn(TEHRAN, '2026-10-28').toISOString()).toBe('2026-10-27T20:30:00.000Z');
    expect(dayEndIn(TEHRAN, '2026-10-28').toISOString()).toBe('2026-10-28T20:29:59.000Z');
    expect(tehranDayEnd('2026-10-28')).toEqual(dayEndIn(TEHRAN, '2026-10-28'));
    expect(tehranDayRange(instant)).toEqual(dayRangeIn(TEHRAN, instant));
  });

  it('weekday of a day', () => {
    expect(weekdayOf(TEHRAN, '2026-10-28')).toBe('wed');
  });
});

describe('org-day in Amsterdam (daylight saving)', () => {
  it('a summer day is +02:00 and a winter day +01:00', () => {
    expect(dayStartIn(AMSTERDAM, '2026-07-01').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(dayStartIn(AMSTERDAM, '2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(dayEndIn(AMSTERDAM, '2026-12-01').toISOString()).toBe('2026-12-01T22:59:59.000Z');
  });

  it('the spring-forward day has 23 hours', () => {
    // 2026-03-29: 02:00 CET → 03:00 CEST
    const { start, end } = dayRangeIn(AMSTERDAM, new Date('2026-03-29T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
    expect(dayEndIn(AMSTERDAM, '2026-03-29').toISOString()).toBe('2026-03-29T21:59:59.000Z');
    expect(dateTimeIn(AMSTERDAM, '2026-03-29', 4).toISOString()).toBe('2026-03-29T02:00:00.000Z');
  });

  it('the fall-back day has 25 hours', () => {
    // 2026-10-25: 03:00 CEST → 02:00 CET
    const { start, end } = dayRangeIn(AMSTERDAM, new Date('2026-10-25T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it('the same instant can be different days in the two zones', () => {
    const instant = new Date('2026-10-27T22:30:00Z'); // 02:00 Tehran, 23:30 Amsterdam
    expect(dayIn(TEHRAN, instant)).toBe('2026-10-28');
    expect(dayIn(AMSTERDAM, instant)).toBe('2026-10-27');
    expect(partsIn(AMSTERDAM, instant).hour).toBe(23);
    expect(daysBetweenIn(AMSTERDAM, instant, new Date('2026-10-28T00:30:00Z'))).toBe(1);
    expect(daysBetweenIn(TEHRAN, instant, new Date('2026-10-28T00:30:00Z'))).toBe(0);
  });

  it('adds calendar days across a DST change', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
