/**
 * Display-only formatting for the Persian UI (design-system §7-3), fixed to Persian and
 * Tehran. A view of `lib/format` (ADR-0013 section 5); extracted screens use `useFormat()`
 * instead, which follows the user's language and the organization's time zone.
 */
import { createFormat } from '@/lib/format';
import { daysBetweenIn } from '@/lib/org-day';

const TZ = 'Asia/Tehran';
const fa = createFormat('fa', TZ);

/** 18 → «۱۸». Use `grouped` for large amounts (۱٬۲۳۴). */
export function faNumber(value: number, options: { grouped?: boolean } = {}): string {
  return fa.number(value, options);
}

/** «۲۷ مهر» */
export function faDayMonth(date: Date): string {
  return fa.dayMonth(date);
}

/** «دوشنبه ۲۷ مهر ۱۴۰۵» */
export function faFullDate(date: Date): string {
  return fa.fullDate(date);
}

/** Seconds → short Persian duration for wait messages: «۴۵ ثانیه», «۳ دقیقه», «۱ ساعت و ۵ دقیقه». */
export function faDuration(totalSeconds: number): string {
  return fa.duration(totalSeconds);
}

/** Persian/Arabic-Indic digits → ASCII. Used before client-side validation of numeric input. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** «۱۲ شهریور ۱۴۰۵» */
export function faDate(date: Date): string {
  return fa.date(date);
}

/** Whole calendar days in Tehran between two instants (0 = same Tehran day). */
export function tehranDaysBetween(earlier: Date, later: Date): number {
  return daysBetweenIn(TZ, earlier, later);
}

/** «امروز»، «دیروز»، «۵ روز پیش»؛ older than a month → «۲۷ مهر». */
export function faRelativeDay(date: Date, now: Date = new Date()): string {
  return fa.relativeDay(date, now);
}

/** «۱ روز»، «۱۲ روز» */
export function faDays(days: number): string {
  return fa.days(days);
}

/** «۱۷:۱۰» (Tehran wall clock). */
export function faTime(date: Date): string {
  return fa.time(date);
}

/** «امروز ۱۰:۰۰»، «دیروز ۱۷:۱۰»، «۲۴ مهر ۱۷:۱۰» (design-system §7-3: relative within a week). */
export function faDayTime(date: Date, now: Date = new Date()): string {
  return fa.dayTime(date, now);
}

/** «۵۲ ساعت» */
export function faHours(hours: number): string {
  return fa.hours(hours);
}

/** «۶ ساعت پیش»، «۲ روز پیش» — for submissions and waiting times. */
export function faAgo(date: Date, now: Date = new Date()): string {
  return fa.ago(date, now);
}

/**
 * Time left until a deadline day, in Tehran calendar days: «امروز»، «فردا»، «۳ روز مانده»;
 * past → «N روز گذشته».
 */
export function faDaysLeft(due: Date, now: Date = new Date()): string {
  return fa.daysLeft(due, now);
}
