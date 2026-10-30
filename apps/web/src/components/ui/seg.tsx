import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/icon';
import { cn } from './cn';

/** Segmented switch between views (mockups §10 `.seg`), e.g. "List | Stages". */
export function SegNav({
  label,
  items,
  current,
  className,
}: {
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon?: IconName }>;
  current: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'inline-flex gap-0.5 rounded-[10px] border border-line bg-surface-3 p-[3px]',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-8 items-center gap-1.5 rounded-[7px] px-3 text-sm font-semibold',
              active ? 'bg-surface text-fg shadow-sm' : 'text-fg-2 hover:text-fg',
            )}
          >
            {item.icon ? <Icon name={item.icon} size={16} /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Filter chip (mockups §10 `.fchip`) as a link: the filter lives in the URL. */
export function ChipLink({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  count?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm leading-none',
        active
          ? 'border-fg bg-fg font-semibold text-surface'
          : 'border-line-2 bg-surface font-medium text-fg hover:border-line-strong',
      )}
    >
      {children}
      {count !== undefined ? (
        <span className={cn('font-semibold tabular-nums', active ? 'opacity-75' : 'text-fg-3')}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}
