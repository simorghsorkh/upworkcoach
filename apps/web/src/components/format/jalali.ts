/**
 * Jalali date helpers for the date picker (ADR-0008). The API only takes Gregorian days
 * `YYYY-MM-DD` (= a Tehran calendar day); the UI shows and reads Jalali. The calendar maths
 * lives in `lib/jalali` (shared with the CSV import); this file adds the UI text, typing
 * rules and month-grid helpers, checked against `Intl(…-u-ca-persian)` in jalali.test.ts.
 * «Today» comes from `tehranDay()` (lib/tehran-day), never from the browser's zone.
 */
import {
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliMonthLength,
  jalaliToGregorian,
} from '@/lib/jalali';
import { tehranDay } from '@/lib/tehran-day';
import { toLatinDigits } from './fa';

export type JalaliDate = { jy: number; jm: number; jd: number };

export function isLeapJalaliYear(jy: number): boolean {
  return isJalaliLeapYear(jy);
}

export { jalaliMonthLength };

function parseDay(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`invalid day ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `2026-10-22` → { jy: 1405, jm: 7, jd: 30 } */
export function dayToJalali(day: string): JalaliDate {
  return gregorianToJalali(day);
}

/** { 1405, 7, 30 } → `2026-10-22`; `null` when the Jalali date does not exist. */
export function jalaliToDay(jy: number, jm: number, jd: number): string | null {
  if (!Number.isInteger(jy) || jy < 1300 || jy > 1500) return null;
  if (!Number.isInteger(jm) || jm < 1 || jm > 12) return null;
  return jalaliToGregorian(jy, jm, jd);
}

/** `day` plus `n` calendar days. */
export function addDaysTo(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parseDay(a);
  const [by, bm, bd] = parseDay(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Today's Tehran calendar day (`YYYY-MM-DD`). */
export function todayDay(now: Date = new Date()): string {
  return tehranDay(now);
}

/** The Tehran day of an instant (e.g. a task's `dueAt` 23:59:59 Tehran → that day). */
export function dayOf(instant: string | Date): string {
  return tehranDay(typeof instant === 'string' ? new Date(instant) : instant);
}

/** 0 = Saturday … 6 = Friday (the Persian week starts on Saturday). */
export function weekdayIndex(day: string): number {
  const [y, m, d] = parseDay(day);
  // Calendar arithmetic on a UTC midnight, not a wall clock: no time zone involved.
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7;
}

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
export const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);

/** `2026-10-22` → «۱۴۰۵/۰۷/۳۰» (the text of the date input). */
export function formatJalaliInput(day: string): string {
  const { jy, jm, jd } = dayToJalali(day);
  return faDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/** `2026-10-22` → «پنجشنبه ۳۰ مهر» (+ « ۱۴۰۵» with `year`). */
export function formatJalaliLong(day: string, { year = false }: { year?: boolean } = {}): string {
  const { jy, jm, jd } = dayToJalali(day);
  const text = `${WEEKDAYS[weekdayIndex(day)]} ${faDigits(String(jd))} ${JALALI_MONTHS[jm - 1]}`;
  return year ? `${text} ${faDigits(String(jy))}` : text;
}

/**
 * Typed Jalali text → Gregorian day, or `null`. Accepts Persian or Latin digits and `/`, `-`,
 * `.` or spaces between parts: «۱۴۰۵/۸/۱», «1405-08-01». A two-digit year means 14xx.
 */
export function parseJalaliInput(text: string): string | null {
  const clean = toLatinDigits(text.trim()).replace(/[٫,]/g, '/');
  const m = /^(\d{2}|\d{4})\s*[/\-.\s]\s*(\d{1,2})\s*[/\-.\s]\s*(\d{1,2})$/.exec(clean);
  if (!m) return null;
  const jy = m[1]?.length === 2 ? 1400 + Number(m[1]) : Number(m[1]);
  return jalaliToDay(jy, Number(m[2]), Number(m[3]));
}
