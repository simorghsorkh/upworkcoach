'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFormat } from '@/components/format/use-format';
import { dayDate } from '@/components/programs/program-text';
import { cn } from '@/components/ui/cn';
import type { SlotsDTO } from '@/modules/scheduling/contracts';
import { type Month, MonthGrid, monthOf, useDayNumber } from './month-grid';

/** «09:30» in the page's digits. */
export function clockLabel(time: string, locale: string): string {
  return locale === 'fa' ? time.replace(/\d/g, (d) => Number(d).toLocaleString('fa-IR')) : time;
}

/**
 * Free slots of one offering (Coach Office sprints 7 and 7b): a month calendar where the days
 * with free times stand out, then the times of the chosen day. Read-only (the mentor's
 * preview) unless `onSelect` is given.
 */
export function SlotCalendar({
  data,
  selected,
  onSelect,
}: {
  data: SlotsDTO;
  selected?: string | null;
  onSelect?: (startsAt: string) => void;
}) {
  const t = useTranslations('scheduling');
  const format = useFormat();
  const locale = useLocale();
  const dayNumber = useDayNumber();
  const firstOpen = data.days.find((d) => d.slots.length)?.day ?? data.days[0]?.day ?? '';
  const [day, setDay] = useState(firstOpen);
  const [month, setMonth] = useState<Month>(() => monthOf(firstOpen, locale));
  const current = data.days.find((d) => d.day === day);
  const byDay = new Map(data.days.map((d) => [d.day, d.slots.length]));

  if (!data.days.some((d) => d.slots.length)) {
    return <p className="text-sm text-fg-3">{t('slots.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset aria-label={t('slots.days')} className="m-0 min-w-0 border-0 p-0 md:max-w-md">
        <MonthGrid
          month={month}
          onMonth={setMonth}
          min={data.days[0]?.day}
          max={data.days.at(-1)?.day}
          renderDay={(d) => {
            const count = byDay.get(d) ?? 0;
            const isCurrent = d === day;
            return (
              <button
                type="button"
                disabled={count === 0}
                aria-pressed={isCurrent}
                aria-label={`${format.fullDate(dayDate(d))}: ${
                  count ? t('slots.count', { count }) : t('slots.noneDay')
                }`}
                onClick={() => setDay(d)}
                className={cn(
                  'flex aspect-square min-h-10 w-full flex-col items-center justify-center rounded-sm text-sm tabular-nums',
                  count === 0
                    ? 'cursor-default text-fg-3 opacity-50'
                    : isCurrent
                      ? 'cursor-pointer bg-primary font-bold text-on-brand'
                      : 'cursor-pointer bg-primary-weak font-semibold text-primary-text hover:bg-primary-weak/70 hover:ring-1 hover:ring-primary-line',
                )}
              >
                {dayNumber(d)}
                {count ? (
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-1 rounded-full',
                      isCurrent ? 'bg-on-brand' : 'bg-primary',
                    )}
                  />
                ) : null}
              </button>
            );
          }}
        />
      </fieldset>
      {current ? (
        <div>
          <p className="mb-2 text-sm text-fg-2">
            {t('slots.times', { day: format.fullDate(dayDate(current.day)) })}
            <span className="ms-2 text-fg-3">
              {t('slots.duration', { count: data.durationMinutes })}
            </span>
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {current.slots.map((s) => {
              const label = format.time(new Date(s));
              return (
                <li key={s}>
                  {onSelect ? (
                    <button
                      type="button"
                      aria-pressed={selected === s}
                      onClick={() => onSelect(s)}
                      className={cn(
                        'min-h-tap w-full cursor-pointer rounded-sm border text-ui font-semibold tabular-nums',
                        selected === s
                          ? 'border-primary bg-primary text-on-brand'
                          : 'border-line-2 bg-surface hover:border-primary-line hover:bg-primary-weak',
                      )}
                    >
                      {label}
                    </button>
                  ) : (
                    <span className="flex min-h-9 items-center justify-center rounded-sm border border-line bg-surface-2 text-sm tabular-nums">
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
