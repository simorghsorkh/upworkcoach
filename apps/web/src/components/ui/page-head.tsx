import type { ReactNode } from 'react';
import { cn } from './cn';

/** Page header — mockups §3 (.page-head): eyebrow, h1 (one per page), sub line, actions. */
export function PageHead({
  title,
  eyebrow,
  sub,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-4 md:mb-6 md:items-end',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="mb-0.5 text-sm font-medium text-fg-3">{eyebrow}</p> : null}
        <h1 className="text-mob-h1 md:text-2xl">{title}</h1>
        {sub ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-sm text-fg-2">{sub}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
