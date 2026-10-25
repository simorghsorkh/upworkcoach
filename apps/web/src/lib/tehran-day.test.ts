import { describe, expect, it } from 'vitest';
import {
  addDays,
  jalaliDate,
  tehranDateTime,
  tehranDay,
  tehranDayEnd,
  tehranDayRange,
  tehranDayStart,
  tehranParts,
  tehranWeekday,
} from './tehran-day';

describe('tehranDay', () => {
  it('uses the Tehran calendar day, not UTC', () => {
    // 2026-10-19 21:00 UTC = 2026-10-20 00:30 in Tehran (UTC+03:30, no DST since 2022).
    expect(tehranDay(new Date('2026-10-19T21:00:00Z'))).toBe('2026-10-20');
    expect(tehranDay(new Date('2026-10-19T20:00:00Z'))).toBe('2026-10-19');
  });
});

describe('Tehran wall-clock helpers', () => {
  it('end of a Tehran day is 23:59:59 Tehran (20:29:59 UTC)', () => {
    expect(tehranDayEnd('2026-10-22').toISOString()).toBe('2026-10-22T20:29:59.000Z');
    expect(tehranDay(tehranDayEnd('2026-10-22'))).toBe('2026-10-22');
  });

  it('start of a Tehran day is 00:00 Tehran (20:30 UTC of the previous day)', () => {
    expect(tehranDayStart('2026-10-22').toISOString()).toBe('2026-10-21T20:30:00.000Z');
  });

  it('builds a wall-clock time and reads it back', () => {
    const at = tehranDateTime('2026-03-21', 9, 30);
    const p = tehranParts(at);
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 3, 21, 9, 30]);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekdays follow the Tehran calendar', () => {
    expect(tehranWeekday('2026-10-23')).toBe('fri');
    expect(tehranWeekday('2026-10-24')).toBe('sat');
  });

  it('today range is [00:00, next 00:00) in Tehran', () => {
    const range = tehranDayRange(new Date('2026-10-19T21:00:00Z'));
    expect(range.start.toISOString()).toBe('2026-10-19T20:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-20T20:30:00.000Z');
  });

  it('rejects malformed days', () => {
    expect(() => tehranDayEnd('1405/07/28')).toThrow();
  });
});

describe('jalaliDate', () => {
  it('formats the Tehran day in the Persian calendar with Latin digits', () => {
    // 2026-10-20 = 1405/07/28.
    expect(jalaliDate(new Date('2026-10-20T08:00:00Z'))).toBe('1405/07/28');
    // 21:00 UTC is already the next day in Tehran.
    expect(jalaliDate(new Date('2026-10-20T21:00:00Z'))).toBe('1405/07/29');
  });
});
