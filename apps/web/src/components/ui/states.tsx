'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons/icon';
import { Button } from './button';
import { cn } from './cn';

/* ---------------------------------------------------------------------------
   Alert — inline message (design-system §4 `.alert`), always with a text title.
   --------------------------------------------------------------------------- */
export type AlertTone = 'info' | 'warn' | 'error' | 'ok' | 'neutral';

const alertTones: Record<AlertTone, { box: string; icon: IconName }> = {
  info: { box: 'bg-primary-weak border-primary-line text-primary-text', icon: 'info' },
  warn: { box: 'bg-h-yellow-bg border-h-yellow-bd text-h-yellow-fg', icon: 'alert' },
  error: { box: 'bg-h-red-bg border-h-red-bd text-h-red-fg', icon: 'alert' },
  ok: { box: 'bg-h-green-bg border-h-green-bd text-h-green-fg', icon: 'check-circle' },
  neutral: { box: 'bg-surface-2 border-line text-fg-2', icon: 'info' },
};

export function Alert({
  tone = 'info',
  title,
  icon,
  action,
  role,
  className,
  children,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  /** `alert` for errors that appear after a user action; `status` for polite updates. */
  role?: 'alert' | 'status';
  className?: string;
  children?: ReactNode;
}) {
  const t = alertTones[tone];
  return (
    <div
      role={role}
      className={cn(
        'mb-4 flex flex-wrap items-start gap-3 rounded-md border px-4 py-3 text-ui leading-[22px] md:flex-nowrap',
        t.box,
        className,
      )}
    >
      <Icon name={icon ?? t.icon} className="mt-px" />
      <div className="min-w-0 flex-1 basis-[calc(100%-32px)] md:basis-auto [&_a]:font-bold [&_a]:text-current [&_a]:underline [&_a]:underline-offset-3">
        {title ? <strong className="me-1 font-bold">{title}</strong> : null}
        {children}
      </div>
      {action ? <div className="ms-8 flex-none self-center md:ms-0">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Empty state — 56px rounded square icon + 15/700 title + one sentence + ≤1 button.
   --------------------------------------------------------------------------- */
export type EmptyTone = 'neutral' | 'ok' | 'brand' | 'error';

const emptyTones: Record<EmptyTone, string> = {
  neutral: 'bg-surface-2 text-fg-3',
  ok: 'bg-h-green-bg text-h-green-fg',
  brand: 'bg-primary-weak-2 text-primary-text',
  error: 'bg-h-red-bg text-h-red-fg',
};

export function EmptyState({
  icon,
  tone = 'neutral',
  title,
  children,
  action,
  headingLevel = 3,
  className,
}: {
  icon: IconName;
  tone?: EmptyTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('px-4 py-8 text-center text-ui text-fg-2', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'mx-auto mb-3 grid size-14 place-items-center rounded-[18px]',
          emptyTones[tone],
        )}
      >
        <Icon name={icon} size={26} />
      </span>
      <Heading className="mb-1 text-md font-bold text-fg">{title}</Heading>
      {children ? <p className="mx-auto max-w-[340px]">{children}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Load error inside a section: red icon + «تلاش دوباره». */
export function ErrorState({
  title = 'این بخش بار نشد',
  children = 'اتصال اینترنت را بررسی کن.',
  onRetry,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert">
      <EmptyState
        icon="alert"
        tone="error"
        title={title}
        className={className}
        action={
          onRetry ? (
            <Button size="sm" onClick={onRetry}>
              <Icon name="refresh" size={16} />
              تلاش دوباره
            </Button>
          ) : undefined
        }
      >
        {children}
      </EmptyState>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Skeleton — same shape as the real row (avatar + two lines).
   --------------------------------------------------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'my-2.5 h-3 animate-skel rounded-xs bg-[length:400%_100%]',
        'bg-[linear-gradient(90deg,var(--c-surface-3)_25%,var(--c-surface-2)_37%,var(--c-surface-3)_63%)]',
        className,
      )}
    />
  );
}

const rowWidths = [
  ['w-3/5', 'w-2/5'],
  ['w-4/5', 'w-[30%]'],
] as const;

/**
 * List placeholder while loading. Announces «در حال بارگذاری…» once and, after
 * 10 seconds, «اتصال کند است…» (design-system §6).
 */
export function SkeletonRows({
  rows = 3,
  label = 'در حال بارگذاری…',
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  const slow = useSlow(10_000);
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => {
        const [a, b] = rowWidths[i % rowWidths.length] ?? rowWidths[0];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="my-0 size-8 flex-none rounded-full" />
            <div className="flex-1">
              <Skeleton className={a} />
              <Skeleton className={b} />
            </div>
          </div>
        );
      })}
      {slow ? <p className="mt-2 text-sm text-fg-3">اتصال کند است…</p> : null}
    </div>
  );
}

function useSlow(afterMs: number) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);
  return slow;
}
