import { describe, expect, it } from 'vitest';
import { createFormat } from './format';

const fa = createFormat('fa', 'Asia/Tehran');
const enTehran = createFormat('en', 'Asia/Tehran');
const enAmsterdam = createFormat('en', 'Europe/Amsterdam');

// 2026-10-19 13:40 UTC = Monday 17:10 Tehran = 15:40 Amsterdam (CEST)
const at = new Date('2026-10-19T13:40:00Z');

describe('createFormat fa (same output as the 0.1 fa.ts)', () => {
  it('numbers', () => {
    expect(fa.number(1234)).toBe('۱۲۳۴');
    expect(fa.number(1234, { grouped: true })).toBe('۱٬۲۳۴');
  });

  it('dates in the Jalali calendar', () => {
    expect(fa.dayMonth(at)).toBe('۲۷ مهر');
    // Word order is ICU's (browsers: «دوشنبه ۲۷ مهر ۱۴۰۵» (Monday 27 Mehr 1405); Node's ICU puts the year first);
    // the weekday comma is always removed.
    const full = fa.fullDate(at);
    for (const part of ['دوشنبه', '۲۷', 'مهر', '۱۴۰۵']) expect(full).toContain(part);
    expect(full).not.toMatch(/[،,]/);
    expect(fa.date(at)).toBe('۲۷ مهر ۱۴۰۵');
    expect(fa.time(at)).toBe('۱۷:۱۰');
  });

  it('durations and counts', () => {
    expect(fa.duration(45)).toBe('۴۵ ثانیه');
    expect(fa.duration(170)).toBe('۳ دقیقه');
    expect(fa.duration(3900)).toBe('۱ ساعت و ۵ دقیقه');
    expect(fa.duration(7200)).toBe('۲ ساعت');
    expect(fa.days(12)).toBe('۱۲ روز');
    expect(fa.hours(1234.4)).toBe('۱۲۳۴ ساعت');
  });

  it('relative days', () => {
    const now = new Date('2026-10-24T08:00:00Z');
    expect(fa.relativeDay(now, now)).toBe('امروز');
    expect(fa.relativeDay(new Date('2026-10-23T08:00:00Z'), now)).toBe('دیروز');
    expect(fa.relativeDay(at, now)).toBe('۵ روز پیش');
    expect(fa.relativeDay(new Date('2026-09-01T08:00:00Z'), now)).toBe('۱۰ شهریور');
    expect(fa.dayTime(at, now)).toBe('۵ روز پیش ۱۷:۱۰');
    expect(fa.dayTime(new Date('2026-10-25T08:00:00Z'), now)).toBe('فردا ۱۱:۳۰');
    expect(fa.ago(new Date('2026-10-24T07:30:00Z'), now)).toBe('کمتر از یک ساعت پیش');
    expect(fa.ago(new Date('2026-10-24T02:00:00Z'), now)).toBe('۶ ساعت پیش');
    expect(fa.daysLeft(new Date('2026-10-27T20:29:59Z'), now)).toBe('۳ روز مانده');
    expect(fa.daysLeft(new Date('2026-10-22T20:29:59Z'), now)).toBe('۲ روز گذشته');
  });
});

describe('createFormat en', () => {
  it('Gregorian dates and Latin digits', () => {
    expect(enTehran.number(1234, { grouped: true })).toBe('1,234');
    expect(enTehran.dayMonth(at)).toBe('Oct 19');
    expect(enTehran.fullDate(at)).toBe('Monday, October 19, 2026');
    expect(enTehran.date(at)).toBe('Oct 19, 2026');
    expect(enTehran.time(at)).toBe('5:10 PM');
  });

  it('plurals', () => {
    expect(enTehran.duration(1)).toBe('1 second');
    expect(enTehran.duration(3660)).toBe('1 hour and 1 minute');
    expect(enTehran.days(1)).toBe('1 day');
    expect(enTehran.days(12)).toBe('12 days');
    const now = new Date('2026-10-24T08:00:00Z');
    expect(enTehran.relativeDay(at, now)).toBe('5 days ago');
    expect(enTehran.daysLeft(new Date('2026-10-25T20:29:59Z'), now)).toBe('Tomorrow');
    expect(enTehran.daysLeft(new Date('2026-10-23T20:29:59Z'), now)).toBe('1 day overdue');
  });
});

describe('the time zone follows the organization', () => {
  it('wall clock in Amsterdam', () => {
    expect(enAmsterdam.time(at)).toBe('3:40 PM');
  });

  it('«today» ends at Amsterdam midnight, not Tehran midnight', () => {
    // 22:30 UTC: already the 28th in Tehran (02:00), still the 27th in Amsterdam (23:30).
    const now = new Date('2026-10-27T22:30:00Z');
    const earlier = new Date('2026-10-27T10:00:00Z');
    expect(enAmsterdam.relativeDay(earlier, now)).toBe('Today');
    expect(enTehran.relativeDay(earlier, now)).toBe('Yesterday');
    expect(enAmsterdam.dayTime(earlier, now)).toBe('Today, 11:00 AM');
  });
});
