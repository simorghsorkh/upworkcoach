'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon, type IconName } from '@/components/icons/icon';
import { cn } from './cn';

/* ---------------------------------------------------------------------------
   Radio cards — mockups §15 `.radio-row` / `.radio-card` (native radios, so arrow keys
   move between options and the group has one tab stop).
   --------------------------------------------------------------------------- */
export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: IconName;
  /** Accessible name when `label` is not plain text. */
  ariaLabel?: string;
  disabled?: boolean;
};

export function RadioCards<T extends string>({
  legend,
  options,
  value,
  onChange,
  hint,
  error,
  hideLegend,
  stack,
  size = 'md',
  className,
}: {
  legend: ReactNode;
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onChange: (value: T) => void;
  hint?: ReactNode;
  error?: string | null;
  hideLegend?: boolean;
  /** One option per line (`.radio-stack`). */
  stack?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const name = useId();
  const hintId = `${name}-hint`;
  return (
    <fieldset
      className={cn('mb-5 min-w-0', className)}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className={cn('mb-1.5 text-ui font-semibold text-fg', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      <div className={cn('flex gap-2', stack ? 'flex-col' : 'flex-wrap')}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-sm border px-3 font-medium transition-colors duration-150 has-[input:focus-visible]:border-focus has-[input:focus-visible]:shadow-ring',
                size === 'sm' ? 'min-h-9 text-sm' : 'min-h-10 text-ui',
                stack && 'min-h-12 justify-start',
                checked
                  ? 'border-primary bg-primary-weak font-semibold text-primary-text shadow-[inset_0_0_0_1px_var(--c-primary)]'
                  : 'border-line-2 bg-surface text-fg hover:border-line-strong',
                o.disabled && 'cursor-not-allowed opacity-65',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                aria-label={o.ariaLabel}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.icon ? (
                <Icon name={o.icon} size={16} />
              ) : checked ? (
                <Icon name="check" size={16} />
              ) : null}
              {o.label}
            </label>
          );
        })}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ---------------------------------------------------------------------------
   Filter / shortcut chip button (`.fchip`, `aria-pressed`).
   --------------------------------------------------------------------------- */
export function ChipButton({
  pressed,
  onClick,
  small,
  children,
  className,
  ariaLabel,
}: {
  pressed?: boolean;
  onClick: () => void;
  small?: boolean;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border leading-none',
        small ? 'min-h-[30px] px-2.5 text-xs' : 'min-h-[34px] px-3 text-sm',
        pressed
          ? 'border-fg bg-fg font-semibold text-surface'
          : 'border-line-2 bg-surface font-medium text-fg hover:border-line-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Score 1..5 — mockups §15 `.rating` (radiogroup of native radios).
   --------------------------------------------------------------------------- */
const RATING_HINT: Record<number, string> = { 1: 'ضعیف', 3: 'متوسط', 5: 'عالی' };

export function Rating({
  legend,
  value,
  onChange,
}: {
  legend: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const name = useId();
  return (
    <fieldset className="mb-5">
      <legend className="mb-1.5 text-ui font-semibold text-fg">{legend}</legend>
      <div className="inline-flex overflow-hidden rounded-sm border border-line-2 bg-surface">
        {[1, 2, 3, 4, 5].map((n) => {
          const checked = value === n;
          return (
            <label
              key={n}
              className={cn(
                'inline-flex min-h-10 min-w-[52px] cursor-pointer flex-col has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-focus items-center justify-center px-2 py-1 text-md leading-[1.1] font-bold [&+&]:border-s [&+&]:border-line max-md:min-w-[44px]',
                checked ? 'bg-primary text-on-brand' : 'text-fg-2 hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={checked}
                onChange={() => onChange(n)}
                // A second click on the selected score clears it (the score is optional).
                onClick={() => {
                  if (checked) onChange(null);
                }}
                className="sr-only"
                aria-label={`${faNumber(n)} از ۵${RATING_HINT[n] ? ` (${RATING_HINT[n]})` : ''}`}
              />
              <span aria-hidden="true">{faNumber(n)}</span>
              {RATING_HINT[n] ? (
                <small
                  aria-hidden="true"
                  className={cn('text-[10px] font-medium', checked ? 'text-on-brand' : 'text-fg-3')}
                >
                  {RATING_HINT[n]}
                </small>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------------------
   Small menu (mockups `.pop`): a button that opens a panel of actions. Esc and a click
   outside close it; focus returns to the button.
   --------------------------------------------------------------------------- */
export function MenuButton({
  label,
  title,
  items,
  buttonClassName,
}: {
  label: ReactNode;
  /** Small heading inside the panel, e.g. «تعویق تا…». */
  title?: string;
  items: ReadonlyArray<{ label: string; onSelect: () => void }>;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        {label}
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute end-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-md border border-line bg-surface p-1.5 shadow-lg"
        >
          {title ? <p className="px-2.5 py-1 text-xs text-fg-3">{title}</p> : null}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex min-h-9 w-full cursor-pointer items-center rounded-xs px-2.5 text-start text-ui text-fg hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
