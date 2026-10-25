/**
 * Display-only formatting for the Persian UI (design-system §7-3).
 * Calendar maths (deadlines, «this Thursday») belongs to src/lib/jalali (ADR-0008);
 * this file only turns numbers and instants into Persian text.
 */

const TZ = 'Asia/Tehran';

const numberFmt = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const groupedFmt = new Intl.NumberFormat('fa-IR');

/** 18 → «۱۸». Use `grouped` for large amounts (۱٬۲۳۴). */
export function faNumber(value: number, { grouped = false }: { grouped?: boolean } = {}): string {
  return (grouped ? groupedFmt : numberFmt).format(value);
}

const dayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
});
const fullDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «۲۷ مهر» */
export function faDayMonth(date: Date): string {
  return dayMonth.format(date);
}

/** «دوشنبه ۲۷ مهر ۱۴۰۵» */
export function faFullDate(date: Date): string {
  // Intl puts a comma after the weekday in fa-IR («دوشنبه، ۲۷ مهر ۱۴۰۵»; Chrome uses a Latin
  // «,»); the design has none.
  return fullDate.format(date).replace(/\s*[،,]\s*/, ' ');
}

/** Seconds → short Persian duration for wait messages: «۴۵ ثانیه», «۳ دقیقه», «۱ ساعت و ۵ دقیقه». */
export function faDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  if (s < 60) return `${faNumber(s)} ثانیه`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return `${faNumber(minutes)} دقیقه`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${faNumber(h)} ساعت و ${faNumber(m)} دقیقه` : `${faNumber(h)} ساعت`;
}

/** Persian/Arabic-Indic digits → ASCII. Used before client-side validation of numeric input. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const dayMonthYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «۱۲ شهریور ۱۴۰۵» */
export function faDate(date: Date): string {
  return dayMonthYear.format(date);
}

const tehranDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Whole calendar days in Tehran between two instants (0 = same Tehran day). */
export function tehranDaysBetween(earlier: Date, later: Date): number {
  const toUtc = (d: Date) => Date.parse(`${tehranDay.format(d)}T00:00:00Z`);
  return Math.round((toUtc(later) - toUtc(earlier)) / 86_400_000);
}

/** «امروز»، «دیروز»، «۵ روز پیش»؛ older than a month → «۲۷ مهر». */
export function faRelativeDay(date: Date, now: Date = new Date()): string {
  const days = tehranDaysBetween(date, now);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  if (days < 30) return `${faNumber(days)} روز پیش`;
  return faDayMonth(date);
}

/** «۱ روز»، «۱۲ روز» */
export function faDays(days: number): string {
  return `${faNumber(days)} روز`;
}

const timeFmt = new Intl.DateTimeFormat('fa-IR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «۱۷:۱۰» (Tehran wall clock). */
export function faTime(date: Date): string {
  return timeFmt.format(date);
}

/** «امروز ۱۰:۰۰»، «دیروز ۱۷:۱۰»، «۲۴ مهر ۱۷:۱۰» (design-system §7-3: relative within a week). */
export function faDayTime(date: Date, now: Date = new Date()): string {
  const days = tehranDaysBetween(date, now);
  const day =
    days === 0
      ? 'امروز'
      : days === 1
        ? 'دیروز'
        : days === -1
          ? 'فردا'
          : days > 1 && days < 7
            ? `${faNumber(days)} روز پیش`
            : faDayMonth(date);
  return `${day} ${faTime(date)}`;
}

/** «۵۲ ساعت» */
export function faHours(hours: number): string {
  return `${faNumber(Math.max(0, Math.round(hours)))} ساعت`;
}

/** «۶ ساعت پیش»، «۲ روز پیش» — for submissions and waiting times. */
export function faAgo(date: Date, now: Date = new Date()): string {
  const hours = (now.getTime() - date.getTime()) / 3_600_000;
  if (hours < 1) return 'کمتر از یک ساعت پیش';
  if (hours < 24) return `${faNumber(Math.floor(hours))} ساعت پیش`;
  return faRelativeDay(date, now);
}

/**
 * Time left until a deadline day, in Tehran calendar days: «امروز»، «فردا»، «۳ روز مانده»;
 * past → «N روز گذشته».
 */
export function faDaysLeft(due: Date, now: Date = new Date()): string {
  const days = tehranDaysBetween(now, due);
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days > 1) return `${faNumber(days)} روز مانده`;
  return `${faNumber(-days)} روز گذشته`;
}
