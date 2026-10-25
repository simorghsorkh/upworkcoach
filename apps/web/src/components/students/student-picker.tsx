'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { apiGet } from '@/components/api/client';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/components/ui/cn';
import type { StudentListDTO } from '@/modules/students/contracts';

export type PickedStudent = { id: string; displayName: string; stage?: string };

/**
 * Student search box (mockups/today.html «یادداشت تازه» → `.suggest`): an ARIA combobox over
 * `GET /api/v1/students?q=` (name, mobile, tag; already limited to the actor's scope).
 * Two letters are enough (user-flows §5). `multiple` keeps the chosen students as chips
 * (bulk task, user-flows §4).
 */
export function StudentPicker({
  label,
  value,
  onChange,
  multiple,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  value: PickedStudent[];
  onChange: (value: PickedStudent[]) => void;
  multiple?: boolean;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedStudent[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const mine = ++seq.current;
    setStatus('loading');
    const t = setTimeout(async () => {
      const res = await apiGet<StudentListDTO>(
        `/api/v1/students?q=${encodeURIComponent(q)}&limit=8`,
      );
      if (mine !== seq.current) return;
      if (!res.ok) {
        setStatus('error');
        setResults([]);
        return;
      }
      setStatus('idle');
      setResults(
        res.data.items.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          stage: `مرحله‌ی ${s.stage.displayCode}`,
        })),
      );
      setActive(0);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const options = results.filter((r) => !value.some((v) => v.id === r.id));

  function pick(s: PickedStudent) {
    onChange(multiple ? [...value, s] : [s]);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, options.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      const option = options[active];
      if (open && option) {
        e.preventDefault();
        pick(option);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && multiple && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const single = !multiple && value[0];

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1.5 block text-ui font-semibold text-fg">
        {label}
      </label>
      {single ? (
        <div className="flex min-h-tap items-center gap-3 rounded-sm border border-primary-line bg-primary-weak px-3 py-1.5">
          <Avatar id={single.id} name={single.displayName} size="sm" />
          <span className="min-w-0 flex-1 truncate font-semibold text-fg">
            {single.displayName}
            {single.stage ? (
              <span className="font-normal text-fg-3">{` · ${single.stage}`}</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-grid size-9 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2"
            aria-label={`برداشتن ${single.displayName}`}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : (
        <>
          {multiple && value.length ? (
            <ul aria-label="هنرجوهای انتخاب‌شده" className="mb-2 flex flex-wrap gap-1.5">
              {value.map((s) => (
                <li
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-line bg-primary-weak py-0.5 ps-1 pe-1 text-sm font-semibold text-primary-text"
                >
                  <Avatar id={s.id} name={s.displayName} size="xs" />
                  {s.displayName}
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                    className="inline-grid size-6 cursor-pointer place-items-center rounded-full hover:bg-primary-weak-2"
                    aria-label={`برداشتن ${s.displayName}`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="relative">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <input
              id={id}
              type="text"
              role="combobox"
              aria-expanded={open && options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
                undefined
              }
              autoComplete="off"
              // biome-ignore lint/a11y/noAutofocus: the picker is the first field of a sheet the user just opened
              autoFocus={autoFocus}
              placeholder="نام، موبایل یا برچسب"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => options.length && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              className={cn(
                'block min-h-tap w-full rounded-sm border bg-surface py-2 ps-10 pe-3 text-input text-fg placeholder:text-fg-3',
                'hover:border-fg-2 focus:border-focus focus:shadow-ring focus:outline-none',
                error ? 'border-h-red-fg shadow-ring-error' : 'border-line-strong',
              )}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="پیشنهادها"
            hidden={!open || options.length === 0}
            className="mt-1.5 overflow-hidden rounded-sm border border-line bg-surface shadow-md"
          >
            {options.map((s, i) => (
              // Combobox pattern: focus stays in the input (aria-activedescendant); arrows/Enter
              // there drive the options, the click is the pointer shortcut.
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input
              <div
                key={s.id}
                tabIndex={-1}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2',
                  i === active ? 'bg-primary-weak' : 'bg-surface',
                )}
              >
                <Avatar id={s.id} name={s.displayName} size="sm" />
                <span className="min-w-0 truncate">
                  <strong className="font-semibold">{s.displayName}</strong>
                  {s.stage ? <span className="text-fg-3">{` · ${s.stage}`}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {status === 'loading'
              ? 'در حال جستجو…'
              : open && query.trim().length >= 2
                ? options.length
                  ? `${options.length} نتیجه`
                  : 'هنرجویی با این نام پیدا نشد'
                : ''}
          </p>
          {status === 'idle' &&
          open &&
          query.trim().length >= 2 &&
          options.length === 0 &&
          results.length === 0 ? (
            <p className="mt-1.5 text-sm text-fg-3">هنرجویی با این نام پیدا نشد.</p>
          ) : null}
          {status === 'error' ? (
            <p className="mt-1.5 text-sm text-h-red-fg">جستجو انجام نشد؛ اتصال را بررسی کن.</p>
          ) : null}
        </>
      )}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
