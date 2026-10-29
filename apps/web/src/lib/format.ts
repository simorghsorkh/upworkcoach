/**
 * Display formatting of numbers and instants (ADR-0013 section 5): the only way the UI shows
 * dates and counts. The language picks calendar and digits (fa: Jalali, Persian digits; en:
 * Gregorian, Latin digits); the organization's time zone picks the wall clock and «today».
 * Calendar maths (deadlines, «this Thursday») belongs to src/lib/org-day and src/lib/jalali.
 * Pure; works on the server and in the browser.
 */
import type { Locale } from '../i18n/config';
import { translate } from '../i18n/translate';
import { daysBetweenIn } from './org-day';

export type Format = {
  /** 18 → «۱۸» / «18». Use `grouped` for large amounts (۱٬۲۳۴). */
  number(value: number, options?: { grouped?: boolean }): string;
  /** «۲۷ مهر» / «Oct 27» */
  dayMonth(date: Date): string;
  /** «دوشنبه ۲۷ مهر ۱۴۰۵» / «Monday, October 27, 2026» */
  fullDate(date: Date): string;
  /** «۱۲ شهریور ۱۴۰۵» / «Sep 3, 2026» */
  date(date: Date): string;
  /** «۱۷:۱۰» / «5:10 PM» (wall clock of the organization) */
  time(date: Date): string;
  /** Seconds → short duration for wait messages: «۴۵ ثانیه», «۳ دقیقه», «۱ ساعت و ۵ دقیقه». */
  duration(totalSeconds: number): string;
  /** «امروز»، «دیروز»، «۵ روز پیش»؛ older than a month → day and month. */
  relativeDay(date: Date, now?: Date): string;
  /** «۱۲ روز» */
  days(count: number): string;
  /** «امروز ۱۰:۰۰»، «دیروز ۱۷:۱۰»، «۲۴ مهر ۱۷:۱۰» (relative within a week). */
  dayTime(date: Date, now?: Date): string;
  /** «۵۲ ساعت» */
  hours(hours: number): string;
  /** «۶ ساعت پیش»، «۲ روز پیش» — for submissions and waiting times. */
  ago(date: Date, now?: Date): string;
  /** Days until a deadline: «امروز»، «فردا»، «۳ روز مانده»؛ past → «N روز گذشته». */
  daysLeft(due: Date, now?: Date): string;
};

const DATE_LOCALE: Record<Locale, string> = { fa: 'fa-IR-u-ca-persian', en: 'en-US' };
const NUMBER_LOCALE: Record<Locale, string> = { fa: 'fa-IR', en: 'en-US' };

const cache = new Map<string, Format>();

export function createFormat(locale: Locale, timeZone: string): Format {
  const cacheKey = `${locale}|${timeZone}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const numberFmt = new Intl.NumberFormat(NUMBER_LOCALE[locale], { useGrouping: false });
  const groupedFmt = new Intl.NumberFormat(NUMBER_LOCALE[locale]);
  const dateLocale = DATE_LOCALE[locale];
  const dayMonthFmt = new Intl.DateTimeFormat(dateLocale, {
    timeZone,
    day: 'numeric',
    month: locale === 'fa' ? 'long' : 'short',
  });
  const fullDateFmt = new Intl.DateTimeFormat(dateLocale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateFmt = new Intl.DateTimeFormat(dateLocale, {
    timeZone,
    day: 'numeric',
    month: locale === 'fa' ? 'long' : 'short',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat(NUMBER_LOCALE[locale], {
    timeZone,
    hour: locale === 'fa' ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: locale === 'fa' ? 'h23' : 'h12',
  });
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, `format.${key}`, params);
  const between = (earlier: Date, later: Date) => daysBetweenIn(timeZone, earlier, later);

  const format: Format = {
    number: (value, { grouped = false } = {}) => (grouped ? groupedFmt : numberFmt).format(value),
    dayMonth: (date) => dayMonthFmt.format(date),
    // Intl puts a comma after the weekday in fa-IR («دوشنبه، ۲۷ مهر ۱۴۰۵»; Chrome uses a Latin
    // «,»); the Persian design has none.
    fullDate: (date) =>
      locale === 'fa'
        ? fullDateFmt.format(date).replace(/\s*[،,]\s*/, ' ')
        : fullDateFmt.format(date),
    date: (date) => dateFmt.format(date),
    time: (date) => timeFmt.format(date),
    duration(totalSeconds) {
      const s = Math.max(0, Math.ceil(totalSeconds));
      if (s < 60) return t('seconds', { count: s });
      const minutes = Math.ceil(s / 60);
      if (minutes < 60) return t('minutes', { count: minutes });
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m ? t('hoursMinutes', { hours: h, minutes: m }) : t('hours', { count: h });
    },
    relativeDay(date, now = new Date()) {
      const days = between(date, now);
      if (days <= 0) return t('today');
      if (days === 1) return t('yesterday');
      if (days < 30) return t('daysAgo', { count: days });
      return format.dayMonth(date);
    },
    days: (count) => t('days', { count }),
    dayTime(date, now = new Date()) {
      const days = between(date, now);
      const day =
        days === 0
          ? t('today')
          : days === 1
            ? t('yesterday')
            : days === -1
              ? t('tomorrow')
              : days > 1 && days < 7
                ? t('daysAgo', { count: days })
                : format.dayMonth(date);
      return t('dayTime', { day, time: format.time(date) });
    },
    hours: (hours) => t('hours', { count: Math.max(0, Math.round(hours)) }),
    ago(date, now = new Date()) {
      const hours = (now.getTime() - date.getTime()) / 3_600_000;
      if (hours < 1) return t('lessThanHourAgo');
      if (hours < 24) return t('hoursAgo', { count: Math.floor(hours) });
      return format.relativeDay(date, now);
    },
    daysLeft(due, now = new Date()) {
      const days = between(now, due);
      if (days === 0) return t('today');
      if (days === 1) return t('tomorrow');
      if (days > 1) return t('daysLeft', { count: days });
      return t('daysPast', { count: -days });
    },
  };
  cache.set(cacheKey, format);
  return format;
}
