'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  addDaysTo,
  dayToJalali,
  jalaliMonthLength,
  jalaliToDay,
  weekdayIndex,
} from '@/components/format/jalali';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { dayDate } from '@/components/programs/program-text';
import type { Weekday } from '@/lib/org-day';

/** Saturday-first, the week of the organization's calendar (matches `weekdayIndex`). */
export const WEEK: Weekday[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

/** A month of the page's calendar: Jalali in Persian, Gregorian otherwise. */
export type Month = { y: number; m: number };

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(day: string, locale: string): Month {
  if (locale === 'fa') {
    const { jy, jm } = dayToJalali(day);
    return { y: jy, m: jm };
  }
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) };
}

export function shiftMonth(month: Month, delta: number): Month {
  const index = month.y * 12 + (month.m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function sameMonth(a: Month, b: Month): boolean {
  return a.y === b.y && a.m === b.m;
}

/** Every day (`YYYY-MM-DD`) of the month. */
export function daysOf(month: Month, locale: string): string[] {
  const first =
    locale === 'fa'
      ? (jalaliToDay(month.y, month.m, 1) as string)
      : `${month.y}-${pad(month.m)}-01`;
  const length =
    locale === 'fa'
      ? jalaliMonthLength(month.y, month.m)
      : new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  return Array.from({ length }, (_, i) => addDaysTo(first, i));
}

/**
 * A month as a Saturday-first grid (Coach Office sprint 7b). The caller draws each day; the
 * weekday headers may be buttons (e.g. "select every Monday").
 */
export function MonthGrid({
  month,
  onMonth,
  min,
  max,
  renderDay,
  onWeekday,
  weekdayLabel,
}: {
  month: Month;
  onMonth: (month: Month) => void;
  /** Months before / after these days cannot be opened. */
  min?: string;
  max?: string;
  renderDay: (day: string) => ReactNode;
  onWeekday?: (weekday: Weekday, days: string[]) => void;
  weekdayLabel?: (weekday: Weekday) => string;
}) {
  const t = useTranslations('scheduling');
  const locale = useLocale();
  const days = daysOf(month, locale);
  const first = days[0] as string;
  const cells: Array<string | null> = [
    ...Array.from({ length: weekdayIndex(first) }, () => null),
    ...days,
  ];
  while (cells.length % 7) cells.push(null);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fa-IR-u-ca-persian', { ...options, timeZone: 'UTC' }).format(
      dayDate(first),
    );
  // Persian reads «آبان ۱۴۰۵» (month, then year); Intl puts the year first.
  const title =
    locale === 'fa'
      ? `${part({ month: 'long' })} ${part({ year: 'numeric' })}`
      : new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(dayDate(first));
  const canPrev = !min || first > min;
  const canNext = !max || (days.at(-1) as string) < max;
  const navClass =
    'inline-grid size-10 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className={navClass}
          aria-label={t('month.prev')}
          disabled={!canPrev}
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          <Icon name="chev-next" size={18} className="rotate-180" />
        </button>
        <h3 className="text-base font-bold" aria-live="polite">
          {title}
        </h3>
        <button
          type="button"
          className={navClass}
          aria-label={t('month.next')}
          disabled={!canNext}
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          <Icon name="chev-next" size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1" role="presentation">
        {WEEK.map((weekday, i) => {
          const label = t(`weekdayShort.${weekday}`);
          const ofWeekday = days.filter((d) => weekdayIndex(d) === i);
          return onWeekday ? (
            <button
              key={weekday}
              type="button"
              title={weekdayLabel?.(weekday)}
              aria-label={weekdayLabel?.(weekday)}
              onClick={() => onWeekday(weekday, ofWeekday)}
              className="min-h-9 cursor-pointer rounded-sm text-xs font-semibold text-fg-3 hover:bg-surface-2 hover:text-fg"
            >
              {label}
            </button>
          ) : (
            <span
              key={weekday}
              title={t(`weekday.${weekday}`)}
              className="flex min-h-8 items-center justify-center text-xs font-semibold text-fg-3"
            >
              {label}
            </span>
          );
        })}
        {cells.map((day, i) =>
          day ? (
            <div key={day} className="min-w-0">
              {renderDay(day)}
            </div>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: empty leading/trailing cells
            <div key={`e${i}`} aria-hidden />
          ),
        )}
      </div>
    </div>
  );
}

/** The day-of-month number of `day` in the page's calendar and digits. */
export function useDayNumber(): (day: string) => string {
  const locale = useLocale();
  const format = useFormat();
  return (day) => format.number(locale === 'fa' ? dayToJalali(day).jd : Number(day.slice(8)));
}
