'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { faNumber } from '@/components/format/fa';
import {
  addDaysTo,
  daysBetween,
  dayToJalali,
  formatJalaliInput,
  formatJalaliLong,
  JALALI_MONTHS,
  jalaliMonthLength,
  jalaliToDay,
  parseJalaliInput,
  todayDay,
  WEEKDAY_SHORT,
  WEEKDAYS,
  weekdayIndex,
} from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { ChipButton } from './choice';
import { cn } from './cn';

export type DateShortcut = { label: string; days: number };

/** Default shortcuts under a deadline field (design-system §4-1: "Tomorrow, 3 days, 1 week"). */
export const DUE_SHORTCUTS: DateShortcut[] = [
  { label: '۳ روز', days: 3 },
  { label: '۱ هفته', days: 7 },
  { label: '۲ هفته', days: 14 },
];

/**
 * Jalali date field (ADR-0008): the user reads and types «۱۴۰۵/۰۸/۰۱» (Persian or Latin
 * digits), picks from a Saturday-first month grid, or taps a shortcut; the value is always
 * the Gregorian Tehran day `YYYY-MM-DD` the API expects (`''` when empty or invalid).
 * The grid opens inline (no floating layer), so it works inside bottom sheets on mobile.
 */
export function JalaliDateField({
  label,
  value,
  onChange,
  min,
  max,
  shortcuts = DUE_SHORTCUTS,
  extraShortcut,
  hint,
  error,
  optional,
  id: explicitId,
}: {
  label: ReactNode;
  value: string;
  onChange: (day: string) => void;
  /** Earliest selectable day (inclusive). */
  min?: string;
  /** Latest selectable day (inclusive), e.g. today for "When did it happen?". */
  max?: string;
  shortcuts?: DateShortcut[];
  /** e.g. "No change" next to the shortcuts. */
  extraShortcut?: { label: string; pressed: boolean; onSelect: () => void };
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id?: string;
}) {
  const auto = useId();
  const id = explicitId ?? `d${auto}`;
  const descId = `${id}-desc`;
  const errorId = `${id}-error`;
  const gridId = `${id}-grid`;
  const today = todayDay();
  const [text, setText] = useState(value ? formatJalaliInput(value) : '');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Follow outside changes (shortcuts, template defaults, reset), but never rewrite what the
  // user is typing: the Jalali text «۱۴۰۵/۰۸/۱» is already a valid day on the way to «۱۴۰۵/۰۸/۱۰».
  const typed = useRef<string | null>(null);
  useEffect(() => {
    if (typed.current !== null && typed.current === value) return;
    typed.current = null;
    setText(value ? formatJalaliInput(value) : '');
    if (value) setTypedError(null);
  }, [value]);

  function commit(raw: string) {
    typed.current = null;
    if (!raw.trim()) {
      setTypedError(null);
      onChange('');
      return;
    }
    const day = parseJalaliInput(raw);
    if (!day) {
      setTypedError('تاریخ را به شکل ۱۴۰۵/۰۸/۰۱ بنویس.');
      onChange('');
      return;
    }
    if (min && day < min) {
      setTypedError(`تاریخ نباید پیش از ${formatJalaliLong(min)} باشد.`);
      onChange('');
      return;
    }
    if (max && day > max) {
      setTypedError(`تاریخ نباید بعد از ${formatJalaliLong(max)} باشد.`);
      onChange('');
      return;
    }
    setTypedError(null);
    setText(formatJalaliInput(day));
    onChange(day);
  }

  const shown = typedError ?? error ?? null;
  const left = value ? daysBetween(today, value) : null;

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1.5 block text-ui font-semibold text-fg">
        {label}
        {optional ? <span className="font-normal text-fg-3"> (اختیاری)</span> : null}
      </label>
      <div className="relative">
        <Icon
          name="calendar"
          size={18}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-3"
        />
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="۱۴۰۵/۰۸/۰۱"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const day = parseJalaliInput(e.target.value);
            if (day && (!min || day >= min) && (!max || day <= max)) {
              setTypedError(null);
              typed.current = day;
              onChange(day);
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          aria-invalid={shown ? true : undefined}
          aria-describedby={[shown ? errorId : null, descId].filter(Boolean).join(' ')}
          className={cn(
            'block min-h-tap w-full rounded-sm border bg-surface py-2 ps-10 pe-12 text-input text-fg placeholder:text-fg-3',
            'transition-[border-color,box-shadow] duration-150 ease-out hover:border-fg-2 focus:border-focus focus:shadow-ring focus:outline-none',
            shown
              ? 'border-h-red-fg shadow-ring-error hover:border-h-red-fg'
              : 'border-line-strong',
          )}
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? gridId : undefined}
          aria-label={open ? 'بستن تقویم' : 'انتخاب از تقویم'}
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-y-0 end-0 my-auto me-1 inline-grid size-9 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2 hover:text-fg"
        >
          <Icon name={open ? 'x' : 'chev-down'} size={18} />
        </button>
      </div>
      <p id={descId} className="mt-1.5 text-sm text-fg-3">
        {value ? (
          <>
            <span className="font-semibold text-fg-2">
              {formatJalaliLong(value, { year: true })}
            </span>
            {left !== null ? ` · ${relativeLabel(left)}` : null}
          </>
        ) : (
          (hint ?? 'روز را بنویس یا از تقویم انتخاب کن.')
        )}
      </p>
      {shown ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
        >
          <Icon name="alert" size={16} />
          {shown}
        </p>
      ) : null}
      {shortcuts.length || extraShortcut ? (
        <fieldset className="mt-2 flex flex-wrap gap-1.5">
          <legend className="sr-only">{`میان‌بُر ${typeof label === 'string' ? label : 'تاریخ'}`}</legend>
          {shortcuts.map((s) => {
            const day = addDaysTo(today, s.days);
            return (
              <ChipButton
                key={s.label}
                small
                pressed={value === day && !extraShortcut?.pressed}
                onClick={() => {
                  setTypedError(null);
                  onChange(day);
                }}
              >
                {s.label}
              </ChipButton>
            );
          })}
          {extraShortcut ? (
            <ChipButton small pressed={extraShortcut.pressed} onClick={extraShortcut.onSelect}>
              {extraShortcut.label}
            </ChipButton>
          ) : null}
        </fieldset>
      ) : null}
      {open ? (
        <MonthGrid
          id={gridId}
          value={value || null}
          today={today}
          min={min}
          max={max}
          onPick={(day) => {
            setTypedError(null);
            onChange(day);
            setOpen(false);
            document.getElementById(id)?.focus();
          }}
          onClose={() => {
            setOpen(false);
            document.getElementById(id)?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function relativeLabel(days: number): string {
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days > 1) return `${faNumber(days)} روز دیگر`;
  return `${faNumber(-days)} روز پیش`;
}

function MonthGrid({
  id,
  value,
  today,
  min,
  max,
  onPick,
  onClose,
}: {
  id: string;
  value: string | null;
  today: string;
  min?: string;
  max?: string;
  onPick: (day: string) => void;
  onClose: () => void;
}) {
  const start = dayToJalali(value ?? (min && min > today ? min : today));
  const [month, setMonth] = useState({ jy: start.jy, jm: start.jm });
  const [focus, setFocus] = useState<string>(value ?? (min && min > today ? min : today));
  const gridRef = useRef<HTMLTableElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const first = jalaliToDay(month.jy, month.jm, 1) ?? today;
  const length = jalaliMonthLength(month.jy, month.jm);
  const offset = weekdayIndex(first);
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length }, (_, i) => addDaysTo(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const shift = (delta: number) => {
    const index = month.jy * 12 + (month.jm - 1) + delta;
    setMonth({ jy: Math.floor(index / 12), jm: (index % 12) + 1 });
  };

  function onKey(event: KeyboardEvent<HTMLTableElement>) {
    const step: Record<string, number> = {
      // RTL: the week runs right → left, so ← is the next day.
      ArrowLeft: 1,
      ArrowRight: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    const delta = step[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = addDaysTo(focus, delta);
    if (min && next < min) return;
    if (max && next > max) return;
    const j = dayToJalali(next);
    if (j.jy !== month.jy || j.jm !== month.jm) setMonth({ jy: j.jy, jm: j.jm });
    moved.current = true;
    setFocus(next);
  }

  const monthTitle = `${JALALI_MONTHS[month.jm - 1]} ${faNumber(month.jy)}`;
  const focusInMonth = cells.includes(focus)
    ? focus
    : cells.find((c) => c && (!min || c >= min) && (!max || c <= max));

  return (
    <div
      id={id}
      className="mt-2 w-full max-w-[340px] rounded-md border border-line bg-surface p-3 shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="ماه قبل"
          className="inline-grid size-9 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2"
        >
          <Icon name="chev-next" size={18} className="rotate-180" />
        </button>
        <p className="text-ui font-bold" aria-live="polite">
          {monthTitle}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="ماه بعد"
          className="inline-grid size-9 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2"
        >
          <Icon name="chev-next" size={18} />
        </button>
      </div>
      <table
        ref={gridRef}
        aria-label={monthTitle}
        onKeyDown={onKey}
        className="w-full border-collapse text-center"
      >
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((d, i) => (
              <th
                key={d}
                scope="col"
                abbr={WEEKDAYS[i]}
                className="pb-1 text-xs font-semibold text-fg-3"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: weeks of one month, fixed order
            <tr key={w}>
              {week.map((day, i) => {
                if (!day) {
                  // biome-ignore lint/suspicious/noArrayIndexKey: empty leading/trailing cells
                  return <td key={`e${i}`} />;
                }
                const disabled = Boolean((min && day < min) || (max && day > max));
                const selected = day === value;
                const isToday = day === today;
                const { jd } = dayToJalali(day);
                return (
                  <td key={day} className="p-0.5">
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === focusInMonth ? 0 : -1}
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${formatJalaliLong(day, { year: true })}${isToday ? ' (امروز)' : ''}`}
                      onClick={() => onPick(day)}
                      onFocus={() => setFocus(day)}
                      className={cn(
                        'inline-grid size-9 cursor-pointer place-items-center rounded-sm text-ui tabular-nums',
                        selected
                          ? 'bg-primary font-bold text-on-brand'
                          : isToday
                            ? 'font-bold text-primary-text ring-1 ring-primary-line ring-inset hover:bg-primary-weak'
                            : 'text-fg hover:bg-surface-2',
                        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                      )}
                    >
                      {faNumber(jd)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-fg-3">با کلیدهای جهت جابه‌جا شو؛ Enter انتخاب می‌کند.</p>
    </div>
  );
}
