import { describe, expect, it } from 'vitest';
import {
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliMonthLength,
  jalaliMonthRange,
  jalaliToGregorian,
  parseAnyCalendarDay,
} from './jalali';
import { addDays, jalaliDate, tehranDateTime } from './tehran-day';

describe('jalali ↔ gregorian', () => {
  it.each([
    [1405, 1, 1, '2026-03-21'],
    [1405, 7, 28, '2026-10-20'],
    [1405, 8, 1, '2026-10-23'],
    [1403, 12, 30, '2025-03-20'],
    [1404, 1, 1, '2025-03-21'],
    [1399, 12, 30, '2021-03-20'],
    [1367, 11, 22, '1989-02-11'],
  ])('%i/%i/%i → %s', (jy, jm, jd, gregorian) => {
    expect(jalaliToGregorian(jy, jm, jd)).toBe(gregorian);
    expect(gregorianToJalali(gregorian)).toEqual({ jy, jm, jd });
  });

  it('agrees with the Intl persian calendar for every day of two years', () => {
    let day = '2025-01-01';
    for (let i = 0; i < 730; i += 1) {
      const intl = jalaliDate(tehranDateTime(day, 12));
      const { jy, jm, jd } = gregorianToJalali(day);
      expect(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`).toBe(intl);
      day = addDays(day, 1);
    }
  });

  it('knows leap years and month lengths', () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
  });

  it('rejects days that do not exist', () => {
    expect(jalaliToGregorian(1404, 12, 30)).toBeNull();
    expect(jalaliToGregorian(1405, 7, 31)).toBeNull();
    expect(jalaliToGregorian(1405, 13, 1)).toBeNull();
    expect(jalaliToGregorian(1405, 0, 1)).toBeNull();
  });
});

describe('parseAnyCalendarDay', () => {
  it.each([
    ['1405/08/01', '2026-10-23'],
    ['۱۴۰۵/۰۸/۰۱', '2026-10-23'],
    ['١٤٠٥-٠٨-٠١', '2026-10-23'],
    ['1405/8/1', '2026-10-23'],
    ['2026-10-23', '2026-10-23'],
    ['2026/10/23', '2026-10-23'],
    [' 2026-10-23 ', '2026-10-23'],
  ])('%s → %s', (input, out) => {
    expect(parseAnyCalendarDay(input)).toBe(out);
  });

  it.each(['1404/12/30', '2026-02-30', '23/10/2026', 'tomorrow', '', '1405/08'])(
    'rejects %s',
    (input) => {
      expect(parseAnyCalendarDay(input)).toBeNull();
    },
  );
});

describe('jalaliMonthRange', () => {
  it('gives the Gregorian bounds of the Jalali month', () => {
    expect(jalaliMonthRange('2026-10-20')).toEqual({ from: '2026-09-23', to: '2026-10-22' });
    expect(jalaliMonthRange('2026-03-21')).toEqual({ from: '2026-03-21', to: '2026-04-20' });
  });
});
