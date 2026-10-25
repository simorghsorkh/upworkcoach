import { describe, expect, it } from 'vitest';
import {
  addDaysTo,
  daysBetween,
  dayToJalali,
  formatJalaliInput,
  formatJalaliLong,
  isLeapJalaliYear,
  jalaliMonthLength,
  jalaliToDay,
  parseJalaliInput,
  weekdayIndex,
} from './jalali';

const intl = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function intlJalali(day: string) {
  const parts = Object.fromEntries(
    intl.formatToParts(new Date(`${day}T12:00:00Z`)).map((p) => [p.type, p.value]),
  );
  return {
    jy: Number.parseInt(parts.year ?? '', 10),
    jm: Number(parts.month),
    jd: Number(parts.day),
  };
}

describe('jalali', () => {
  it('matches Intl (persian calendar) for every day of 1395–1415 both ways', () => {
    let day = '2016-03-20'; // 1 Farvardin 1395
    for (let i = 0; i < 365 * 21; i += 1) {
      const expected = intlJalali(day);
      expect(dayToJalali(day)).toEqual(expected);
      expect(jalaliToDay(expected.jy, expected.jm, expected.jd)).toBe(day);
      day = addDaysTo(day, 1);
    }
  });

  it('knows month lengths and leap years', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliToDay(1404, 12, 30)).toBeNull();
    expect(jalaliToDay(1405, 13, 1)).toBeNull();
  });

  it('formats and parses the input text (Persian or Latin digits)', () => {
    expect(formatJalaliInput('2026-10-22')).toBe('۱۴۰۵/۰۷/۳۰');
    expect(formatJalaliLong('2026-10-22')).toBe('پنجشنبه ۳۰ مهر');
    expect(formatJalaliLong('2026-10-22', { year: true })).toBe('پنجشنبه ۳۰ مهر ۱۴۰۵');
    expect(parseJalaliInput('۱۴۰۵/۰۷/۳۰')).toBe('2026-10-22');
    expect(parseJalaliInput('1405-8-1')).toBe('2026-10-23');
    expect(parseJalaliInput('05/08/01')).toBe('2026-10-23');
    expect(parseJalaliInput('۱۴۰۵ ۸ ۱')).toBe('2026-10-23');
    expect(parseJalaliInput('1405/07/31')).toBeNull();
    expect(parseJalaliInput('فردا')).toBeNull();
  });

  it('weekday starts on Saturday; day arithmetic', () => {
    expect(weekdayIndex('2026-10-17')).toBe(0); // Saturday
    expect(weekdayIndex('2026-10-23')).toBe(6); // Friday
    expect(addDaysTo('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
  });
});
