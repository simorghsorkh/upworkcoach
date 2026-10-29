import { cn } from '@/components/ui/cn';

/**
 * Program progress bar (ADR-0012 section 6): required activities done out of all required.
 * `percent` null means nothing required exists yet: the track stays empty and `text` says
 * so, never 0% or 100%. Server-safe: the caller passes the formatted text.
 */
export function ProgressMeter({
  percent,
  label,
  text,
  className,
}: {
  percent: number | null;
  /** Accessible name, e.g. "Program progress". */
  label: string;
  /** Visible value, e.g. "40% (2 of 5)" or "not measurable yet". */
  text: string;
  className?: string;
}) {
  const value = percent === null ? null : Math.min(Math.max(Math.round(percent), 0), 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={text}
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        {value !== null ? (
          <div
            className={cn('h-full rounded-full', value === 100 ? 'bg-h-green-fg' : 'bg-primary')}
            style={{ width: `${value}%` }}
          />
        ) : null}
      </div>
      <span className="flex-none text-xs text-fg-2 tabular-nums">{text}</span>
    </div>
  );
}
