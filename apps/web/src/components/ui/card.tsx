import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/icon';
import { Count } from './badge';
import { cn } from './cn';

/** Card — mockups/styles.css §6 (.card, .card-head, .card-link). */
export function Card({
  flush,
  className,
  as: Tag = 'section',
  ...rest
}: HTMLAttributes<HTMLElement> & { flush?: boolean; as?: 'section' | 'div' | 'article' }) {
  return (
    <Tag
      className={cn(
        'min-w-0 rounded-md border border-line bg-surface shadow-sm',
        flush ? 'p-0' : 'p-4 md:p-5',
        className,
      )}
      {...rest}
    />
  );
}

type CardHeadProps = {
  title: ReactNode;
  titleId?: string;
  icon?: IconName;
  count?: number;
  countLabel?: string;
  sub?: ReactNode;
  link?: { href: string; label: string };
  actions?: ReactNode;
  className?: string;
};

export function CardHead({
  title,
  titleId,
  icon,
  count,
  countLabel,
  sub,
  link,
  actions,
  className,
}: CardHeadProps) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-3', className)}>
      <h2 id={titleId} className="flex items-center gap-2 text-h2">
        {icon ? <Icon name={icon} className="text-fg-3" /> : null}
        {title}
        {count !== undefined ? <Count value={count} label={countLabel} /> : null}
        {sub ? <span className="text-sm font-normal text-fg-3">{sub}</span> : null}
      </h2>
      {actions}
      {link ? (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
        >
          {link.label}
          <Icon name="chev-next" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
